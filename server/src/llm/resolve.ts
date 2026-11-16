/**
 * Which model each agent runs on (pure). An agent's own `llm` in the team file
 * wins; otherwise the `.env` default applies: `LLM_PROVIDER` and that provider's
 * default model (`GEMINI_MODEL`, `OLLAMA_MODEL` …). Exception: with
 * `LLM_PROVIDER=mock` every agent is mock.
 */
import type { AgentConfig, LLMProviderName, TeamConfig } from '@agent-office/shared';
import type { Env } from '../env';
import type { LLMCallMeta } from './types';

export interface ResolvedModel {
  provider: LLMProviderName;
  model: string;
}

type ModelEnv = Pick<
  Env,
  'LLM_PROVIDER' | 'GEMINI_MODEL' | 'ANTHROPIC_MODEL' | 'OLLAMA_MODEL' | 'OPENROUTER_MODEL'
>;

export function defaultModel(provider: LLMProviderName, env: ModelEnv): string {
  switch (provider) {
    case 'mock':
      return 'mock';
    case 'gemini':
      return env.GEMINI_MODEL;
    case 'anthropic':
      return env.ANTHROPIC_MODEL;
    case 'ollama':
      return env.OLLAMA_MODEL;
    case 'openrouter':
      return env.OPENROUTER_MODEL;
  }
}

/**
 * `LLM_PROVIDER=mock` is the "try it without setup" mode: every agent runs on mock,
 * whatever its own `llm` says, so a fresh clone needs no key and no Ollama.
 */
export function resolveModel(agent: Pick<AgentConfig, 'llm'>, env: ModelEnv): ResolvedModel {
  if (env.LLM_PROVIDER === 'mock') return { provider: 'mock', model: 'mock' };
  const provider = agent.llm?.provider ?? env.LLM_PROVIDER;
  return { provider, model: agent.llm?.model ?? defaultModel(provider, env) };
}

export function coordinatorOf(team: TeamConfig): AgentConfig {
  const coordinator = team.agents.find((a) => a.type === 'coordinator');
  if (!coordinator) throw new Error(`Team "${team.id}" has no coordinator`);
  return coordinator;
}

/** The agent whose model answers this call: the worker for its work, the coordinator otherwise. */
export function agentForCall(meta: LLMCallMeta): AgentConfig {
  return meta.kind === 'work' ? meta.agent : coordinatorOf(meta.team);
}
