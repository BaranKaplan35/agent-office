import type {
  AgentConfig,
  Lang,
  LLMProviderName,
  TeamConfig,
  TokenUsage,
} from '@agent-office/shared';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * What a call is for. Real providers ignore this; the mock provider uses it to
 * produce believable, team-agnostic answers without a model.
 */
/** A question round the user already answered (for the plan prompt and the mock). */
export interface AnsweredClarification {
  reply: string;
  questions: string[];
  answer: string;
}

export type LLMCallMeta =
  | {
      kind: 'plan';
      team: TeamConfig;
      task: string;
      lang: Lang;
      /** Earlier question rounds and the user's answers, oldest first. */
      clarifications: AnsweredClarification[];
      /** False once the question rounds are used up: the coordinator must plan. */
      canAsk: boolean;
    }
  | {
      kind: 'work';
      team: TeamConfig;
      agent: AgentConfig;
      task: string;
      lang: Lang;
      title: string;
      instructions: string;
      /** Agents whose approved work was handed in as context. */
      basedOn: AgentConfig[];
      revision?: { note: string; nextVersion: number };
    }
  | {
      kind: 'merge';
      team: TeamConfig;
      task: string;
      lang: Lang;
      sources: Array<{ agent: AgentConfig; markdown: string }>;
      revision?: { note: string; nextVersion: number };
    };

export interface LLMRequest {
  /** The model to use; the router fills it in from the agent (see `resolve.ts`). */
  model?: string;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  /** Ask the model for a JSON-only answer (used for the coordinator's plan). */
  json?: boolean;
  signal?: AbortSignal;
  meta: LLMCallMeta;
}

export interface LLMResponse {
  text: string;
  /** Absent when the provider reported no token counts. */
  usage?: TokenUsage;
  /** True when the model stopped at the output-token limit (the end may be missing). */
  truncated?: boolean;
  /** Filled in by the router: the model that answered and how long it took. */
  provider?: LLMProviderName;
  model?: string;
  durationMs?: number;
}

export interface LLMProvider {
  readonly name: LLMProviderName;
  generate(request: LLMRequest): Promise<LLMResponse>;
}
