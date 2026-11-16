import type { AgentConfig, Lang, ReportVersion, TeamConfig } from '@agent-office/shared';
import type { ChatMessage, LLMRequest } from '../llm';
import type { AnsweredClarification } from '../llm/types';

const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', tr: 'Turkish' };

export interface ApprovedSource {
  subtaskId: string;
  agent: AgentConfig;
  title: string;
  version: number;
  markdown: string;
}

/**
 * A word budget that fits the token limit with room to spare (about three tokens per
 * Turkish word, fewer in English), so reports end properly instead of being cut off.
 */
export function wordBudget(maxOutputTokens: number): number {
  return Math.max(150, Math.floor((maxOutputTokens * 0.33) / 50) * 50);
}

/** Appended to every report-writing system prompt so team configs stay short. */
function reportRules(lang: Lang, maxOutputTokens: number): string {
  return `
---
Output rules (from the AgentOffice system):
- Write the entire report in ${LANGUAGE_NAMES[lang]}.
- Use GitHub-flavoured Markdown. Put code in fenced code blocks. Never use raw HTML.
- Begin with one or two plain sentences that summarise the result (no heading before them), then use "##" headings for the sections.
- No greetings, no meta commentary, no questions at the end. If something is unclear, list it under an "Open questions" section.
- Keep the whole document under about ${wordBudget(maxOutputTokens)} words: it is cut off at ${maxOutputTokens} tokens. Prefer short lists and tables to long prose.`;
}

function coordinatorOf(team: TeamConfig): AgentConfig {
  const coordinator = team.agents.find((a) => a.type === 'coordinator');
  if (!coordinator) throw new Error(`team "${team.id}" has no coordinator`);
  return coordinator;
}

function sourcesBlock(heading: string, sources: ApprovedSource[], lang: Lang): string {
  if (sources.length === 0) return '';
  const blocks = sources.map(
    (s) =>
      `### ${s.agent.role[lang]} — ${s.agent.name[lang]} (${s.subtaskId}, v${s.version})\n\n${s.markdown}`,
  );
  return `\n\n## ${heading}\n\n${blocks.join('\n\n')}`;
}

/**
 * The user's request in one line, answers included ("selam — a traffic light
 * lesson for 10-year-olds"). Used where a short form is needed (mock texts).
 */
export function requestLine(task: string, clarifications: AnsweredClarification[] = []): string {
  return [task, ...clarifications.map((c) => c.answer)].join(' — ');
}

/** The task as handed to workers and the merge: the request plus what the user clarified. */
function taskBlock(task: string, clarifications: AnsweredClarification[]): string {
  let text = `## Task from the user\n\n${task}`;
  if (clarifications.length === 0) return text;
  const rounds = clarifications.map((c) => {
    const asked = c.questions.length ? c.questions.map((q) => `- ${q}`).join('\n') : `- ${c.reply}`;
    return `The coordinator asked:\n${asked}\n\nThe user answered: ${c.answer}`;
  });
  text += `\n\n## Details the user gave when asked\n\n${rounds.join('\n\n')}`;
  return text;
}

export interface PlanOptions {
  /** Question rounds the user already answered, oldest first. */
  clarifications?: AnsweredClarification[];
  /** False once the question rounds are used up. */
  canAsk?: boolean;
}

function decisionRules(lang: Lang, canAsk: boolean): string {
  const language = LANGUAGE_NAMES[lang];
  if (!canAsk) {
    return `- The user has already answered your questions. Plan now ("action": "plan"); make reasonable assumptions for anything still open and name them in "summary".`;
  }
  return `- First decide whether you can plan. Ask instead ("action": "clarify") ONLY when the message is not a task (a greeting, small talk, a test message) or so vague that you cannot tell what the team should produce. Then write a short, friendly "reply" in ${language} (1–2 sentences; answer a greeting in kind) and 1–3 short "questions" in ${language} whose answers would let you plan. Leave "summary" empty and "subtasks" empty.
- If the task is clear enough, plan ("action": "plan", "reply": "", "questions": []). When details are missing but a sensible assumption works, plan anyway and mention the assumption in "summary". Never ask about things the team can decide itself.
- "summary" describes the plan for the user; don't comment on whether the task was clear.`;
}

export function buildPlanRequest(
  team: TeamConfig,
  task: string,
  lang: Lang,
  options: PlanOptions = {},
): LLMRequest {
  const clarifications = options.clarifications ?? [];
  const canAsk = options.canAsk ?? true;
  const coordinator = coordinatorOf(team);
  const workers = team.agents.filter((a) => a.type === 'worker');
  const roster = workers
    .map((w) => {
      const usual = w.dependsOn?.length ? w.dependsOn.join(', ') : 'nothing';
      return `- id "${w.id}": ${w.name.en}, ${w.role.en}. Usually builds on: ${usual}.`;
    })
    .join('\n');

  const system = `${coordinator.systemPrompt}
---
You are now PLANNING. Split the user's task into subtasks for your team.

Team members (use these ids exactly):
${roster}

Rules:
${decisionRules(lang, canAsk)}
- Create at most one subtask per team member. Skip members who are not needed.
- Subtask ids are "sub_1", "sub_2", … in the order you list them.
- "dependsOn" lists the ids of subtasks whose approved output this subtask needs. Follow the usual hand-offs above unless the task clearly needs otherwise. Never create cycles.
- Write "summary", titles and instructions in ${LANGUAGE_NAMES[lang]}. Titles: at most 8 words. Instructions: 2–4 concrete sentences.
- Reply with JSON only, no Markdown fences, exactly in this shape:
{"action": "plan" | "clarify", "reply": string, "questions": string[], "summary": string, "subtasks": [{"id": string, "assignee": string, "title": string, "instructions": string, "dependsOn": string[]}]}`;

  // Earlier rounds as a conversation: the coordinator's questions, then each answer.
  const messages: ChatMessage[] = [{ role: 'user', content: task }];
  for (const c of clarifications) {
    messages.push(
      {
        role: 'assistant',
        content: JSON.stringify({
          action: 'clarify',
          reply: c.reply,
          questions: c.questions,
          summary: '',
          subtasks: [],
        }),
      },
      { role: 'user', content: c.answer },
    );
  }

  return {
    system,
    messages,
    maxOutputTokens: team.settings.maxOutputTokens,
    json: true,
    meta: { kind: 'plan', team, task, lang, clarifications, canAsk },
  };
}

export interface WorkRequestInput {
  team: TeamConfig;
  agent: AgentConfig;
  task: string;
  lang: Lang;
  title: string;
  instructions: string;
  sources: ApprovedSource[];
  /** What the user told the coordinator when asked (if anything). */
  clarifications?: AnsweredClarification[];
  /** Present when the user sent the previous version back. */
  revision?: { previous: ReportVersion; note: string };
}

export function buildWorkRequest(input: WorkRequestInput): LLMRequest {
  const { team, agent, task, lang, title, instructions, sources, revision } = input;
  const clarifications = input.clarifications ?? [];
  const brief =
    `${taskBlock(task, clarifications)}\n\n## Your subtask: ${title}\n\n${instructions}` +
    sourcesBlock('Approved work from your teammates', sources, lang);

  const messages: ChatMessage[] = [{ role: 'user', content: brief }];
  if (revision) {
    messages.push(
      { role: 'assistant', content: revision.previous.markdown },
      {
        role: 'user',
        content: `The user reviewed your report (v${revision.previous.version}) and asks for changes:\n\n${revision.note}\n\nReturn the complete revised report, not only the changes. Start with a short summary that says what changed.`,
      },
    );
  }

  return {
    system: agent.systemPrompt + reportRules(lang, team.settings.maxOutputTokens),
    messages,
    maxOutputTokens: team.settings.maxOutputTokens,
    meta: {
      kind: 'work',
      team,
      agent,
      task: requestLine(task, clarifications),
      lang,
      title,
      instructions,
      basedOn: sources.map((s) => s.agent),
      revision: revision
        ? { note: revision.note, nextVersion: revision.previous.version + 1 }
        : undefined,
    },
  };
}

export interface MergeRequestInput {
  team: TeamConfig;
  task: string;
  lang: Lang;
  sources: ApprovedSource[];
  clarifications?: AnsweredClarification[];
  revision?: { previous: ReportVersion; note: string };
}

export function buildMergeRequest(input: MergeRequestInput): LLMRequest {
  const { team, task, lang, sources, revision } = input;
  const clarifications = input.clarifications ?? [];
  const coordinator = coordinatorOf(team);
  const finalTitle = team.finalTitle[lang];
  const maxOutputTokens = Math.min(team.settings.maxOutputTokens * 2, 16384);

  const system = `${coordinator.systemPrompt}
---
You are now MERGING. Combine the approved reports into one coherent final document titled "${finalTitle}".
- Start the document with "# ${finalTitle}" and a short overview.
- Keep every essential detail (code, tables, materials, numbers). Remove duplication and fix inconsistencies between sections.
- Organise it for the reader, not by team member.${reportRules(lang, maxOutputTokens)}`;

  const brief = taskBlock(task, clarifications) + sourcesBlock('Approved reports', sources, lang);
  const messages: ChatMessage[] = [{ role: 'user', content: brief }];
  if (revision) {
    messages.push(
      { role: 'assistant', content: revision.previous.markdown },
      {
        role: 'user',
        content: `The user reviewed the final document (v${revision.previous.version}) and asks for changes:\n\n${revision.note}\n\nReturn the complete revised document.`,
      },
    );
  }

  return {
    system,
    messages,
    maxOutputTokens,
    meta: {
      kind: 'merge',
      team,
      task: requestLine(task, clarifications),
      lang,
      sources: sources.map((s) => ({ agent: s.agent, markdown: s.markdown })),
      revision: revision
        ? { note: revision.note, nextVersion: revision.previous.version + 1 }
        : undefined,
    },
  };
}
