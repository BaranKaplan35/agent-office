import { randomUUID } from 'node:crypto';
import {
  MAX_CLARIFICATIONS,
  type AgentConfig,
  type AgentMessage,
  type CallMetrics,
  type CreateTaskRequest,
  type ReportVersion,
  type Subtask,
  type Task,
  type TaskEvent,
  type TeamConfig,
} from '@agent-office/shared';
import type { LLMProvider, LLMRequest, LLMResponse } from '../llm';
import type { AnsweredClarification } from '../llm/types';
import { defaultPlan, type PlanDraft } from '../teams/defaultPlan';
import { INTERRUPTED, type PersistedTask, type TaskPersistence } from './persistence';
import { PlanParseError, parseCoordinatorAnswer, type CoordinatorAnswer } from './planParser';
import {
  buildMergeRequest,
  buildPlanRequest,
  buildWorkRequest,
  ensureTitle,
  requestLine,
  type ApprovedSource,
} from './prompts';
import { summarize } from './summarize';

export type OrchestratorErrorCode = 'not_found' | 'invalid_state' | 'revision_limit' | 'validation';

export class OrchestratorError extends Error {
  override name = 'OrchestratorError';
  constructor(
    readonly code: OrchestratorErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface TeamSource {
  get(id: string): TeamConfig | undefined;
}

export interface OrchestratorOptions {
  llm: LLMProvider;
  teams: TeamSource;
  /** Per model call. */
  timeoutMs?: number;
  /** Finished tasks beyond this count are forgotten. */
  maxTasks?: number;
  now?: () => Date;
  /** Keep tasks across restarts (see `persistence.ts`); without it, memory only. */
  persistence?: TaskPersistence;
  /** Wait this long after a change before saving, so bursts are one write (ms). */
  saveDelayMs?: number;
}

export const MAX_NOTE_LENGTH = 2000;

/** A model answer plus what the call cost. */
type MeasuredResponse = LLMResponse & { metrics: CallMetrics };

type Listener = (event: TaskEvent) => void;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewMessage = DistributiveOmit<AgentMessage, 'id' | 'taskId' | 'createdAt'>;

/** Server-only state that never goes to the client. */
interface Runtime {
  /** Snapshot of the team at creation, so a config reload can't change a running task. */
  team: TeamConfig;
  abort: AbortController;
  messageSeq: number;
  /** Note of the last attempt per subtask (undefined = first attempt), for retries. */
  lastNotes: Map<string, string | undefined>;
  lastFinalNote?: string;
}

const TERMINAL: ReadonlyArray<Task['status']> = ['completed', 'cancelled', 'failed'];

/** Question rounds the user has answered, in the shape the prompts need. */
function answered(task: Task): AnsweredClarification[] {
  return task.clarifications.flatMap((c) =>
    c.answer === undefined ? [] : [{ reply: c.reply, questions: c.questions, answer: c.answer }],
  );
}

/**
 * Owns every task: plans with the coordinator, schedules subtasks along their
 * dependencies, records reports and the user's decisions, merges the final output
 * and publishes each change to subscribers. Agents never talk to each other
 * directly — every message is created and logged here.
 */
export class Orchestrator {
  private readonly tasks = new Map<string, Task>();
  private readonly runtimes = new Map<string, Runtime>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly timeoutMs: number;
  private readonly maxTasks: number;
  private readonly now: () => Date;

  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: OrchestratorOptions) {
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxTasks = options.maxTasks ?? 50;
    this.now = options.now ?? (() => new Date());
    if (options.persistence) this.restore(options.persistence.load());
  }

  // ---------------------------------------------------------------- persistence

  /** How many tasks were restored from the saved file at startup. */
  restoredCount = 0;

  /** Write pending changes now (on shutdown). */
  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.options.persistence) return;
    const records: PersistedTask[] = [];
    for (const [id, task] of this.tasks) {
      const rt = this.runtimes.get(id);
      if (!rt) continue;
      records.push({
        task,
        team: rt.team,
        messageSeq: rt.messageSeq,
        lastNotes: Object.fromEntries([...rt.lastNotes].map(([k, v]) => [k, v ?? null])),
        lastFinalNote: rt.lastFinalNote ?? null,
      });
    }
    try {
      this.options.persistence.save(records);
    } catch (err) {
      console.error('Saving tasks failed:', err);
    }
  }

  private scheduleSave(): void {
    if (!this.options.persistence || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), this.options.saveDelayMs ?? 150);
    this.saveTimer.unref?.();
  }

  /**
   * Bring saved tasks back. Model calls that were in flight are gone, so that work is
   * marked as failed with a clear message; the usual "Try again" continues it.
   */
  private restore(records: PersistedTask[]): void {
    for (const record of records) {
      const { task } = record;
      this.tasks.set(task.id, task);
      this.runtimes.set(task.id, {
        team: record.team,
        abort: new AbortController(),
        messageSeq: record.messageSeq,
        lastNotes: new Map(
          Object.entries(record.lastNotes).map(([k, v]) => [k, v ?? undefined] as const),
        ),
        lastFinalNote: record.lastFinalNote ?? undefined,
      });
      if (TERMINAL.includes(task.status)) continue;
      this.interrupt(task);
    }
    this.restoredCount = records.length;
  }

  private interrupt(task: Task): void {
    const fail = (code: string, subtaskId?: string, revision = 0) =>
      this.message(task, {
        type: 'error',
        ...(subtaskId ? { subtaskId } : {}),
        from: 'system',
        to: 'user',
        revision,
        payload: { code, message: INTERRUPTED, retryable: true },
      });
    if (task.status === 'planning') {
      task.status = 'failed';
      task.error = INTERRUPTED;
      fail('planning_failed');
    }
    for (const sub of task.subtasks) {
      if (sub.status !== 'working' && sub.status !== 'revising') continue;
      sub.status = 'failed';
      sub.error = INTERRUPTED;
      fail('agent_failed', sub.id, sub.versions.length);
    }
    if (task.final && (task.final.status === 'merging' || task.final.status === 'revising')) {
      task.final = { ...task.final, status: 'failed', error: INTERRUPTED };
      fail('merge_failed', undefined, task.final.versions.length);
    }
    task.updatedAt = this.timestamp();
  }

  // ---------------------------------------------------------------- queries

  getTask(taskId: string): Task {
    return structuredClone(this.mustGet(taskId));
  }

  /** Listen to changes of one task. Returns an unsubscribe function. */
  subscribe(taskId: string, listener: Listener): () => void {
    this.mustGet(taskId);
    let set = this.listeners.get(taskId);
    if (!set) this.listeners.set(taskId, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(taskId);
    };
  }

  // ---------------------------------------------------------------- commands

  createTask(input: CreateTaskRequest): Task {
    const team = this.options.teams.get(input.teamId);
    if (!team) throw new OrchestratorError('not_found', `Unknown team "${input.teamId}"`);
    const prompt = input.prompt.trim();
    if (!prompt) throw new OrchestratorError('validation', 'The task description is empty');

    const createdAt = this.timestamp();
    const task: Task = {
      id: `task_${randomUUID().slice(0, 8)}`,
      teamId: team.id,
      prompt,
      lang: input.lang,
      status: 'planning',
      clarifications: [],
      planCalls: [],
      subtasks: [],
      messages: [],
      createdAt,
      updatedAt: createdAt,
    };
    this.tasks.set(task.id, task);
    this.runtimes.set(task.id, {
      team,
      abort: new AbortController(),
      messageSeq: 0,
      lastNotes: new Map(),
    });
    this.forgetOldTasks();
    this.scheduleSave();

    void this.runPlanning(task);
    return structuredClone(task);
  }

  /** The user answers the coordinator's questions; planning continues with the answer. */
  answerClarification(taskId: string, answer: string): Task {
    const task = this.mustGetActive(taskId);
    const clean = this.validateNote(answer, 'An answer is required');
    const open = task.clarifications.at(-1);
    if (task.status !== 'awaiting_clarification' || !open || open.answer !== undefined) {
      throw new OrchestratorError('invalid_state', 'The coordinator is not waiting for an answer');
    }
    open.answer = clean;
    open.answeredAt = this.timestamp();
    task.status = 'planning';
    this.publish(
      task,
      this.message(task, {
        type: 'clarification_answer',
        from: 'user',
        to: this.coordinator(task).id,
        revision: 0,
        payload: { round: open.round, answer: clean },
      }),
    );
    void this.runPlanning(task);
    return structuredClone(task);
  }

  /**
   * Plan again after planning failed (e.g. a rate limit or the model was down).
   * The task keeps its prompt and any answered questions. Only a task that failed
   * before it had a plan can be retried; later failures are per report.
   */
  retryPlanning(taskId: string): Task {
    const task = this.mustGet(taskId);
    if (task.status !== 'failed' || task.subtasks.length > 0) {
      throw new OrchestratorError('invalid_state', 'Planning has not failed');
    }
    task.status = 'planning';
    task.error = undefined;
    this.runtime(task).abort = new AbortController();
    this.publish(task);
    void this.runPlanning(task);
    return structuredClone(task);
  }

  approve(taskId: string, subtaskId: string): Task {
    const task = this.mustGetActive(taskId);
    const sub = this.mustGetSubtask(task, subtaskId);
    if (sub.status !== 'awaiting_review') {
      throw new OrchestratorError('invalid_state', `Subtask ${sub.id} is not waiting for review`);
    }
    const version = this.latest(sub.versions).version;
    sub.status = 'approved';
    sub.approvedVersion = version;
    this.publish(
      task,
      this.message(task, {
        type: 'approval',
        subtaskId: sub.id,
        from: 'user',
        to: sub.assignee,
        revision: version - 1,
        payload: { version },
      }),
    );

    if (task.subtasks.every((s) => s.status === 'approved')) void this.runMerge(task);
    else this.schedule(task);
    return structuredClone(task);
  }

  revise(taskId: string, subtaskId: string, note: string): Task {
    const task = this.mustGetActive(taskId);
    const sub = this.mustGetSubtask(task, subtaskId);
    const cleanNote = this.validateNote(note);
    if (sub.status !== 'awaiting_review') {
      throw new OrchestratorError('invalid_state', `Subtask ${sub.id} is not waiting for review`);
    }
    this.assertRevisionsLeft(task, sub.versions.length);

    const current = this.latest(sub.versions);
    sub.status = 'revising';
    this.publish(
      task,
      this.message(task, {
        type: 'revision_request',
        subtaskId: sub.id,
        from: 'user',
        to: sub.assignee,
        revision: current.version,
        payload: { version: current.version, note: cleanNote },
      }),
    );
    void this.runWork(task, sub, cleanNote);
    return structuredClone(task);
  }

  /** Repeat the last failed attempt of a subtask (first try or revision). */
  retry(taskId: string, subtaskId: string): Task {
    const task = this.mustGetActive(taskId);
    const sub = this.mustGetSubtask(task, subtaskId);
    if (sub.status !== 'failed') {
      throw new OrchestratorError('invalid_state', `Subtask ${sub.id} has not failed`);
    }
    const note = this.runtime(task).lastNotes.get(sub.id);
    sub.status = note === undefined ? 'working' : 'revising';
    sub.error = undefined;
    this.publish(task);
    void this.runWork(task, sub, note);
    return structuredClone(task);
  }

  approveFinal(taskId: string): Task {
    const task = this.mustGetActive(taskId);
    const final = task.final;
    if (!final || final.status !== 'awaiting_review') {
      throw new OrchestratorError('invalid_state', 'The final output is not waiting for review');
    }
    const version = this.latest(final.versions).version;
    final.status = 'approved';
    final.approvedVersion = version;
    task.status = 'completed';
    this.publish(
      task,
      this.message(task, {
        type: 'approval',
        from: 'user',
        to: this.coordinator(task).id,
        revision: version - 1,
        payload: { version },
      }),
    );
    return structuredClone(task);
  }

  reviseFinal(taskId: string, note: string): Task {
    const task = this.mustGetActive(taskId);
    const final = task.final;
    const cleanNote = this.validateNote(note);
    if (!final || final.status !== 'awaiting_review') {
      throw new OrchestratorError('invalid_state', 'The final output is not waiting for review');
    }
    this.assertRevisionsLeft(task, final.versions.length);

    const current = this.latest(final.versions);
    this.publish(
      task,
      this.message(task, {
        type: 'revision_request',
        from: 'user',
        to: this.coordinator(task).id,
        revision: current.version,
        payload: { version: current.version, note: cleanNote },
      }),
    );
    void this.runMerge(task, cleanNote);
    return structuredClone(task);
  }

  retryFinal(taskId: string): Task {
    const task = this.mustGetActive(taskId);
    if (task.final?.status !== 'failed') {
      throw new OrchestratorError('invalid_state', 'The final output has not failed');
    }
    void this.runMerge(task, this.runtime(task).lastFinalNote);
    return structuredClone(task);
  }

  cancel(taskId: string): Task {
    const task = this.mustGetActive(taskId);
    task.status = 'cancelled';
    this.runtime(task).abort.abort(new Error('Task cancelled'));
    this.publish(task);
    return structuredClone(task);
  }

  // ---------------------------------------------------------------- workflow

  private async runPlanning(task: Task): Promise<void> {
    const rt = this.runtime(task);
    const clarifications = answered(task);
    const canAsk = task.clarifications.length < MAX_CLARIFICATIONS;
    let answer: CoordinatorAnswer | undefined;
    let lastError: unknown;

    // Two attempts; an unusable plan falls back to the team's default hand-offs.
    for (let attempt = 0; attempt < 2 && !answer; attempt++) {
      try {
        const res = await this.call(
          task,
          buildPlanRequest(rt.team, task.prompt, task.lang, { clarifications, canAsk }),
        );
        if (this.isClosed(task)) return;
        task.planCalls.push(res.metrics);
        answer = parseCoordinatorAnswer(res.text, rt.team, { canAsk });
      } catch (err) {
        if (this.isClosed(task)) return;
        lastError = err;
      }
    }

    if (answer?.kind === 'clarify') {
      const round = task.clarifications.length + 1;
      task.clarifications.push({
        round,
        reply: answer.reply,
        questions: answer.questions,
        askedAt: this.timestamp(),
      });
      task.status = 'awaiting_clarification';
      this.publish(
        task,
        this.message(task, {
          type: 'clarification',
          from: this.coordinator(task).id,
          to: 'user',
          revision: 0,
          payload: { round, reply: answer.reply, questions: answer.questions },
        }),
      );
      return;
    }

    let plan: PlanDraft | undefined = answer?.plan;
    const request = requestLine(task.prompt, clarifications);
    if (!plan) {
      if (!(lastError instanceof PlanParseError)) {
        task.status = 'failed';
        task.error = this.describeError(lastError);
        this.publish(
          task,
          this.message(task, {
            type: 'error',
            from: 'system',
            to: 'user',
            revision: 0,
            payload: { code: 'planning_failed', message: task.error, retryable: true },
          }),
        );
        return;
      }
      plan = defaultPlan(rt.team, request, task.lang);
    }

    const fallbackSummary = defaultPlan(rt.team, request, task.lang).summary;
    task.planSummary = plan.summary || fallbackSummary;
    task.subtasks = plan.subtasks.map((p) => ({ ...p, status: 'blocked', versions: [] }));
    task.status = 'running';
    this.publish(
      task,
      this.message(task, {
        type: 'plan',
        from: this.coordinator(task).id,
        to: 'user',
        revision: 0,
        payload: { summary: task.planSummary, subtasks: plan.subtasks },
      }),
    );
    this.schedule(task);
  }

  /** Start every blocked subtask whose dependencies are all approved. */
  private schedule(task: Task): void {
    if (task.status !== 'running') return;
    for (const sub of task.subtasks) {
      if (sub.status !== 'blocked') continue;
      const ready = sub.dependsOn.every((id) => this.findSubtask(task, id)?.status === 'approved');
      if (ready) this.startSubtask(task, sub);
    }
  }

  private startSubtask(task: Task, sub: Subtask): void {
    sub.status = 'working';
    this.publish(
      task,
      this.message(task, {
        type: 'assignment',
        subtaskId: sub.id,
        from: this.coordinator(task).id,
        to: sub.assignee,
        revision: 0,
        payload: {
          title: sub.title,
          instructions: sub.instructions,
          dependsOn: sub.dependsOn,
          context: this.approvedSources(task, sub.dependsOn).map((s) => ({
            subtaskId: s.subtaskId,
            agentId: s.agent.id,
            version: s.version,
          })),
        },
      }),
    );
    void this.runWork(task, sub, undefined);
  }

  private async runWork(task: Task, sub: Subtask, note: string | undefined): Promise<void> {
    const rt = this.runtime(task);
    rt.lastNotes.set(sub.id, note);
    const agent = this.agent(task, sub.assignee);
    const previous = sub.versions.at(-1);

    try {
      const res = await this.call(
        task,
        buildWorkRequest({
          team: rt.team,
          agent,
          task: task.prompt,
          lang: task.lang,
          title: sub.title,
          instructions: sub.instructions,
          sources: this.approvedSources(task, sub.dependsOn),
          clarifications: answered(task),
          revision: note !== undefined && previous ? { previous, note } : undefined,
        }),
      );
      if (this.isClosed(task)) return;

      const version = this.newVersion(sub.versions.length + 1, res, note);
      sub.versions.push(version);
      sub.status = 'awaiting_review';
      sub.error = undefined;
      this.publish(
        task,
        this.message(task, {
          type: 'report',
          subtaskId: sub.id,
          from: agent.id,
          to: 'user',
          revision: version.version - 1,
          payload: {
            version: version.version,
            markdown: version.markdown,
            summary: version.summary,
            metrics: version.metrics,
          },
        }),
      );
    } catch (err) {
      if (this.isClosed(task)) return;
      sub.status = 'failed';
      sub.error = this.describeError(err);
      this.publish(
        task,
        this.message(task, {
          type: 'error',
          subtaskId: sub.id,
          from: 'system',
          to: 'user',
          revision: sub.versions.length,
          payload: { code: 'agent_failed', message: sub.error, retryable: true },
        }),
      );
    }
  }

  private async runMerge(task: Task, note?: string): Promise<void> {
    const rt = this.runtime(task);
    rt.lastFinalNote = note;
    const versions = task.final?.versions ?? [];
    const previous = versions.at(-1);

    task.status = 'merging';
    task.final = { status: note === undefined ? 'merging' : 'revising', versions };
    this.publish(task);

    try {
      const sources = this.approvedSources(
        task,
        task.subtasks.map((s) => s.id),
      );
      const res = await this.call(
        task,
        buildMergeRequest({
          team: rt.team,
          task: task.prompt,
          lang: task.lang,
          sources,
          clarifications: answered(task),
          revision: note !== undefined && previous ? { previous, note } : undefined,
        }),
      );
      if (this.isClosed(task)) return;

      // The final document always opens with its title, whatever the model did.
      const title = rt.team.finalTitle[task.lang];
      const version = this.newVersion(
        versions.length + 1,
        { ...res, text: ensureTitle(res.text, title) },
        note,
      );
      versions.push(version);
      task.final = { status: 'awaiting_review', versions };
      task.status = 'awaiting_final_review';
      this.publish(
        task,
        this.message(task, {
          type: 'final',
          from: this.coordinator(task).id,
          to: 'user',
          revision: version.version - 1,
          payload: {
            version: version.version,
            markdown: version.markdown,
            sources: sources.map((s) => ({ subtaskId: s.subtaskId, version: s.version })),
            metrics: version.metrics,
          },
        }),
      );
    } catch (err) {
      if (this.isClosed(task)) return;
      const error = this.describeError(err);
      task.final = { status: 'failed', versions, error };
      this.publish(
        task,
        this.message(task, {
          type: 'error',
          from: 'system',
          to: 'user',
          revision: versions.length,
          payload: { code: 'merge_failed', message: error, retryable: true },
        }),
      );
    }
  }

  // ---------------------------------------------------------------- helpers

  /**
   * One model call with the task's cancel signal and the safety-net timeout. The
   * router reports which model answered and how long it took; without a router
   * (tests), the provider name and the measured time stand in.
   */
  private async call(task: Task, request: LLMRequest): Promise<MeasuredResponse> {
    const signal = AbortSignal.any([
      this.runtime(task).abort.signal,
      AbortSignal.timeout(this.timeoutMs),
    ]);
    const started = performance.now();
    const res = await this.options.llm.generate({ ...request, signal });
    const metrics: CallMetrics = {
      provider: res.provider ?? this.options.llm.name,
      model: res.model ?? request.model ?? this.options.llm.name,
      durationMs: res.durationMs ?? Math.round(performance.now() - started),
      ...(res.usage ? { usage: res.usage } : {}),
    };
    return { ...res, metrics };
  }

  private newVersion(version: number, res: MeasuredResponse, note?: string): ReportVersion {
    const markdown = res.text.trim();
    if (!markdown) throw new Error('The model returned an empty answer');
    return {
      version,
      markdown,
      summary: summarize(markdown),
      createdAt: this.timestamp(),
      ...(note !== undefined ? { revisionNote: note } : {}),
      metrics: res.metrics,
    };
  }

  private approvedSources(task: Task, subtaskIds: string[]): ApprovedSource[] {
    return subtaskIds.flatMap((id) => {
      const sub = this.findSubtask(task, id);
      const version = sub?.versions.find((v) => v.version === sub.approvedVersion);
      if (!sub || !version) return [];
      return [
        {
          subtaskId: sub.id,
          agent: this.agent(task, sub.assignee),
          title: sub.title,
          version: version.version,
          markdown: version.markdown,
        },
      ];
    });
  }

  private message(task: Task, msg: NewMessage): AgentMessage {
    const rt = this.runtime(task);
    rt.messageSeq += 1;
    const full = {
      ...msg,
      id: `msg_${String(rt.messageSeq).padStart(4, '0')}`,
      taskId: task.id,
      createdAt: this.timestamp(),
    } as AgentMessage;
    task.messages.push(full);
    return full;
  }

  private publish(task: Task, message?: AgentMessage): void {
    task.updatedAt = this.timestamp();
    this.scheduleSave();
    const listeners = this.listeners.get(task.id);
    if (!listeners?.size) return;
    const snapshot = structuredClone(task);
    const event: TaskEvent = message
      ? { kind: 'message', message, task: snapshot }
      : { kind: 'snapshot', task: snapshot };
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Task listener failed:', err);
      }
    }
  }

  private validateNote(note: string, emptyMessage = 'A revision note is required'): string {
    const clean = note.trim();
    if (!clean) throw new OrchestratorError('validation', emptyMessage);
    if (clean.length > MAX_NOTE_LENGTH) {
      throw new OrchestratorError(
        'validation',
        `Notes are limited to ${MAX_NOTE_LENGTH} characters`,
      );
    }
    return clean;
  }

  private assertRevisionsLeft(task: Task, versionCount: number): void {
    const max = this.runtime(task).team.settings.maxRevisions;
    if (versionCount - 1 >= max) {
      throw new OrchestratorError(
        'revision_limit',
        `The revision limit (${max}) is reached; only approval is possible`,
      );
    }
  }

  private describeError(err: unknown): string {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return `The model did not answer within ${Math.round(this.timeoutMs / 1000)} s`;
    }
    return err instanceof Error ? err.message : String(err);
  }

  private latest(versions: ReportVersion[]): ReportVersion {
    const last = versions.at(-1);
    if (!last) throw new OrchestratorError('invalid_state', 'There is no report yet');
    return last;
  }

  private isClosed(task: Task): boolean {
    return task.status === 'cancelled' || !this.tasks.has(task.id);
  }

  private mustGet(taskId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) throw new OrchestratorError('not_found', `Unknown task "${taskId}"`);
    return task;
  }

  private mustGetActive(taskId: string): Task {
    const task = this.mustGet(taskId);
    if (TERMINAL.includes(task.status)) {
      throw new OrchestratorError('invalid_state', `Task is ${task.status}`);
    }
    return task;
  }

  private mustGetSubtask(task: Task, subtaskId: string): Subtask {
    const sub = this.findSubtask(task, subtaskId);
    if (!sub) throw new OrchestratorError('not_found', `Unknown subtask "${subtaskId}"`);
    return sub;
  }

  private findSubtask(task: Task, subtaskId: string): Subtask | undefined {
    return task.subtasks.find((s) => s.id === subtaskId);
  }

  private runtime(task: Task): Runtime {
    const rt = this.runtimes.get(task.id);
    if (!rt) throw new OrchestratorError('not_found', `Unknown task "${task.id}"`);
    return rt;
  }

  private agent(task: Task, agentId: string): AgentConfig {
    const agent = this.runtime(task).team.agents.find((a) => a.id === agentId);
    if (!agent) throw new Error(`Agent "${agentId}" is not in team "${task.teamId}"`);
    return agent;
  }

  private coordinator(task: Task): AgentConfig {
    const agent = this.runtime(task).team.agents.find((a) => a.type === 'coordinator');
    if (!agent) throw new Error(`Team "${task.teamId}" has no coordinator`);
    return agent;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  /** Keep memory bounded: drop the oldest finished tasks beyond `maxTasks`. */
  private forgetOldTasks(): void {
    if (this.tasks.size <= this.maxTasks) return;
    for (const [id, task] of this.tasks) {
      if (this.tasks.size <= this.maxTasks) break;
      if (!TERMINAL.includes(task.status)) continue;
      this.tasks.delete(id);
      this.runtimes.delete(id);
      this.listeners.delete(id);
    }
  }
}
