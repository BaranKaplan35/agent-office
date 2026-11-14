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
export type LLMCallMeta =
  | { kind: 'plan'; team: TeamConfig; task: string; lang: Lang }
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
  usage?: TokenUsage;
}

export interface LLMProvider {
  readonly name: LLMProviderName;
  generate(request: LLMRequest): Promise<LLMResponse>;
}
