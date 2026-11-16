/**
 * Types shared by server and client. This file is the single source of truth
 * for the shape of teams, tasks and agent messages.
 */
import type { LANGS, LLM_PROVIDERS, PERSONALITIES } from './constants';

export type Lang = (typeof LANGS)[number];
export type LLMProviderName = (typeof LLM_PROVIDERS)[number];

/** A string translated into every supported language. */
export type Localized = Record<Lang, string>;

// ---------------------------------------------------------------------------
// Team configuration (loaded from teams/*.yaml)
// ---------------------------------------------------------------------------

export type AgentType = 'coordinator' | 'worker';

export interface AgentConfig {
  /** Unique within the team, e.g. "curriculum". */
  id: string;
  type: AgentType;
  /** Character name shown on the desk label, e.g. "Mira". */
  name: Localized;
  /** Job title, e.g. "Curriculum Designer". */
  role: Localized;
  /** lucide icon name, e.g. "book-open". */
  icon: string;
  /** Hex colour, e.g. "#F59E5B". */
  deskColor: string;
  systemPrompt: string;
  /** Workers whose approved output this worker usually needs. Workers only. */
  dependsOn?: string[];
  /** Optional canned Markdown used by the mock provider. */
  mockResponse?: string;
  /**
   * What the character does in its free time in the office. Optional: without it,
   * a stable personality is derived from the agent's name.
   */
  personality?: Personality;
  /**
   * Which model this agent runs on. Optional: without it the `.env` default applies
   * (`LLM_PROVIDER` and that provider's default model). Without `model`, the
   * provider's default model is used.
   */
  llm?: AgentLLM;
}

export interface AgentLLM {
  provider: LLMProviderName;
  model?: string;
}

export type Personality = (typeof PERSONALITIES)[number];

export interface TeamSettings {
  /** Revisions allowed per subtask before only "approve" remains. */
  maxRevisions: number;
  maxOutputTokens: number;
}

export interface TeamConfig {
  id: string;
  version: number;
  name: Localized;
  description: Localized;
  taskPlaceholder: Localized;
  finalTitle: Localized;
  settings: TeamSettings;
  agents: AgentConfig[];
}

/** The model an agent actually runs on, after the `.env` default is applied. */
export interface ResolvedLLM {
  provider: LLMProviderName;
  model: string;
}

/**
 * Team as sent to the client: system prompts and mock data stay on the server.
 * `llm` is always the resolved model (shown on desks and reports); keys never leave.
 */
export type PublicAgent = Omit<AgentConfig, 'systemPrompt' | 'mockResponse' | 'llm'> & {
  llm: ResolvedLLM;
  /**
   * Set when this agent's model can't be used right now (missing API key, Ollama not
   * running or the model not pulled). The team can't start tasks until it is fixed.
   */
  unavailable?: string;
};
export type PublicTeam = Omit<TeamConfig, 'agents'> & { agents: PublicAgent[] };

// ---------------------------------------------------------------------------
// Tasks and subtasks
// ---------------------------------------------------------------------------

export type TaskStatus =
  | 'planning'
  /** The coordinator asked the user for details before planning. */
  | 'awaiting_clarification'
  | 'running'
  | 'merging'
  | 'awaiting_final_review'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type SubtaskStatus =
  'blocked' | 'working' | 'awaiting_review' | 'revising' | 'approved' | 'failed';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** What one model call cost: which model answered, how long it took, how many tokens. */
export interface CallMetrics {
  provider: LLMProviderName;
  model: string;
  /** Time the model took (waiting for a free slot excluded, retries included). */
  durationMs: number;
  /** Absent when the provider reported no token counts. */
  usage?: TokenUsage;
}

/** One delivered version of a report (v1, v2, ...). Never mutated after creation. */
export interface ReportVersion {
  version: number;
  markdown: string;
  summary: string;
  createdAt: string;
  /** The user's note that triggered this version (absent for v1). */
  revisionNote?: string;
  metrics?: CallMetrics;
  /** The model stopped at the output-token limit, so the end may be missing. */
  truncated?: boolean;
}

/**
 * The coordinator found the task too vague (or not a task at all) and asked
 * first. Once the user answers, planning continues with the answer.
 */
export interface Clarification {
  /** 1 for the first question round. */
  round: number;
  /** A short reply to the user, e.g. a greeting back. */
  reply: string;
  /** 0–3 questions; the reply alone may already ask. */
  questions: string[];
  askedAt: string;
  answer?: string;
  answeredAt?: string;
}

export interface Subtask {
  id: string;
  /** Worker agent id. */
  assignee: string;
  title: string;
  instructions: string;
  /** Subtask ids that must be approved before this one starts. */
  dependsOn: string[];
  status: SubtaskStatus;
  versions: ReportVersion[];
  /** Version number the user approved, once approved. */
  approvedVersion?: number;
  error?: string;
}

export interface FinalOutput {
  status: 'merging' | 'awaiting_review' | 'revising' | 'approved' | 'failed';
  versions: ReportVersion[];
  approvedVersion?: number;
  error?: string;
}

export interface Task {
  id: string;
  teamId: string;
  prompt: string;
  lang: Lang;
  status: TaskStatus;
  planSummary?: string;
  /** Question rounds before planning, oldest first (usually none). */
  clarifications: Clarification[];
  /** The coordinator's planning calls (including the ones that asked questions). */
  planCalls: CallMetrics[];
  subtasks: Subtask[];
  final?: FinalOutput;
  /** Set when the task as a whole failed (e.g. the model was unreachable while planning). */
  error?: string;
  messages: AgentMessage[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Agent messages. Agents never talk directly: the orchestrator routes and logs
// every message, and the client turns them into office animations.
// ---------------------------------------------------------------------------

/** Agent id, or one of the two non-agent participants. */
export type Participant = string | 'user' | 'system';

interface MessageBase<T extends string, P> {
  id: string;
  taskId: string;
  subtaskId?: string;
  type: T;
  from: Participant;
  to: Participant;
  /** 0 for the first attempt, +1 for each revision request. */
  revision: number;
  createdAt: string;
  payload: P;
}

export interface PlannedSubtask {
  id: string;
  assignee: string;
  title: string;
  instructions: string;
  dependsOn: string[];
}

export interface ContextRef {
  subtaskId: string;
  agentId: string;
  version: number;
}

export type PlanMessage = MessageBase<'plan', { summary: string; subtasks: PlannedSubtask[] }>;

export type AssignmentMessage = MessageBase<
  'assignment',
  { title: string; instructions: string; dependsOn: string[]; context: ContextRef[] }
>;

export type ClarificationMessage = MessageBase<
  'clarification',
  { round: number; reply: string; questions: string[] }
>;

export type ClarificationAnswerMessage = MessageBase<
  'clarification_answer',
  { round: number; answer: string }
>;

export type ReportMessage = MessageBase<
  'report',
  { version: number; markdown: string; summary: string; metrics?: CallMetrics }
>;

export type ApprovalMessage = MessageBase<'approval', { version: number }>;

export type RevisionRequestMessage = MessageBase<
  'revision_request',
  { version: number; note: string }
>;

export type FinalMessage = MessageBase<
  'final',
  {
    version: number;
    markdown: string;
    sources: Array<{ subtaskId: string; version: number }>;
    metrics?: CallMetrics;
  }
>;

export type ErrorMessage = MessageBase<
  'error',
  { code: string; message: string; retryable: boolean }
>;

export type AgentMessage =
  | ClarificationMessage
  | ClarificationAnswerMessage
  | PlanMessage
  | AssignmentMessage
  | ReportMessage
  | ApprovalMessage
  | RevisionRequestMessage
  | FinalMessage
  | ErrorMessage;

export type MessageType = AgentMessage['type'];

// ---------------------------------------------------------------------------
// HTTP API and server-sent events
// ---------------------------------------------------------------------------

export interface HealthResponse {
  ok: true;
  provider: LLMProviderName;
  version: string;
}

export interface CreateTaskRequest {
  teamId: string;
  prompt: string;
  lang: Lang;
}

export interface CreateTaskResponse {
  taskId: string;
}

export interface ReviseRequest {
  note: string;
}

export interface ClarifyRequest {
  answer: string;
}

/** Every event carries a full task snapshot so the client never drifts. */
export type TaskEvent =
  { kind: 'snapshot'; task: Task } | { kind: 'message'; message: AgentMessage; task: Task };

export interface ApiError {
  error: { code: string; message: string };
}
