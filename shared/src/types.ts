/**
 * Types shared by server and client. This file is the single source of truth
 * for the shape of teams, tasks and agent messages.
 */
import type { LANGS, LLM_PROVIDERS } from './constants';

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
}

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

/** Team as sent to the client: system prompts and mock data stay on the server. */
export type PublicAgent = Omit<AgentConfig, 'systemPrompt' | 'mockResponse'>;
export type PublicTeam = Omit<TeamConfig, 'agents'> & { agents: PublicAgent[] };

// ---------------------------------------------------------------------------
// Tasks and subtasks
// ---------------------------------------------------------------------------

export type TaskStatus =
  | 'planning'
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

/** One delivered version of a report (v1, v2, ...). Never mutated after creation. */
export interface ReportVersion {
  version: number;
  markdown: string;
  summary: string;
  createdAt: string;
  /** The user's note that triggered this version (absent for v1). */
  revisionNote?: string;
  usage?: TokenUsage;
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

export type ReportMessage = MessageBase<
  'report',
  { version: number; markdown: string; summary: string; usage?: TokenUsage }
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
    usage?: TokenUsage;
  }
>;

export type ErrorMessage = MessageBase<
  'error',
  { code: string; message: string; retryable: boolean }
>;

export type AgentMessage =
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

/** Every event carries a full task snapshot so the client never drifts. */
export type TaskEvent =
  { kind: 'snapshot'; task: Task } | { kind: 'message'; message: AgentMessage; task: Task };

export interface ApiError {
  error: { code: string; message: string };
}
