/**
 * Startup preflight: resolve the model of every agent of every team and check
 * that it can be used: the provider's API key is set, and for Ollama that the
 * server answers and the model is pulled. It never stops the server; the
 * problems name exactly who is affected, and those teams can't start tasks.
 * Cloud providers are not called here (no tokens are spent on a check).
 */
import type { AgentConfig, LLMProviderName, TeamConfig } from '@agent-office/shared';
import type { Env } from '../env';
import type { FetchLike } from './providers/http';
import { trimSlash } from './providers/ollama';
import { resolveModel } from './resolve';

export interface PreflightProblem {
  teamId: string;
  agentId: string;
  /** English display name, for the log. */
  agentName: string;
  provider: LLMProviderName;
  model: string;
  reason: string;
}

const KEYS: Partial<
  Record<LLMProviderName, 'GEMINI_API_KEY' | 'ANTHROPIC_API_KEY' | 'OPENROUTER_API_KEY'>
> = {
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/** Does `pulled` (names from /api/tags) contain `model`? "llama3" matches "llama3:latest". */
export function hasOllamaModel(pulled: ReadonlyArray<string>, model: string): boolean {
  const want = model.includes(':') ? model : `${model}:latest`;
  return pulled.some((name) => name === model || name === want);
}

type OllamaState = { ok: true; models: string[] } | { ok: false; reason: string };

async function ollamaState(
  env: Env,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<OllamaState> {
  const base = trimSlash(env.OLLAMA_BASE_URL);
  try {
    const res = await fetchImpl(`${base}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, reason: `Ollama at ${base} answered HTTP ${res.status}` };
    const body = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    const models = (body.models ?? [])
      .flatMap((m) => [m.name, m.model])
      .filter((n): n is string => !!n);
    return { ok: true, models };
  } catch {
    return { ok: false, reason: `Ollama is not running at ${base} (start it with "ollama serve")` };
  }
}

export async function preflight(
  teams: ReadonlyArray<TeamConfig>,
  env: Env,
  deps: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<PreflightProblem[]> {
  const fetchImpl = deps.fetch ?? fetch;
  const uses = teams.flatMap((team) =>
    team.agents.map((agent) => ({ team, agent, ...resolveModel(agent, env) })),
  );

  let ollama: OllamaState | undefined;
  if (uses.some((u) => u.provider === 'ollama')) {
    ollama = await ollamaState(env, fetchImpl, deps.timeoutMs ?? 3000);
  }

  const problems: PreflightProblem[] = [];
  const report = (
    team: TeamConfig,
    agent: AgentConfig,
    provider: LLMProviderName,
    model: string,
    reason: string,
  ) =>
    problems.push({
      teamId: team.id,
      agentId: agent.id,
      agentName: agent.name.en,
      provider,
      model,
      reason,
    });

  for (const { team, agent, provider, model } of uses) {
    const keyVar = KEYS[provider];
    if (keyVar && !env[keyVar]) {
      report(team, agent, provider, model, `${keyVar} is not set in .env`);
    } else if (provider === 'ollama' && ollama) {
      if (!ollama.ok) report(team, agent, provider, model, ollama.reason);
      else if (!hasOllamaModel(ollama.models, model)) {
        report(
          team,
          agent,
          provider,
          model,
          `the model is not pulled (run "ollama pull ${model}")`,
        );
      }
    }
  }
  return problems;
}

/** One log line, e.g. `⚠ maker-lesson-studio › Quinn (test) → ollama:qwen3.5:9b — Ollama is not running …`. */
export function formatProblem(p: PreflightProblem): string {
  return `⚠ ${p.teamId} › ${p.agentName} (${p.agentId}) → ${p.provider}:${p.model} — ${p.reason}`;
}

/** For the log: which model every agent of every team will use. */
export function describeModels(teams: ReadonlyArray<TeamConfig>, env: Env): string[] {
  return teams.map((team) => {
    const parts = team.agents.map((a) => {
      const { provider, model } = resolveModel(a, env);
      return `${a.name.en} ${provider}:${model}`;
    });
    return `  ${team.id}: ${parts.join(', ')}`;
  });
}
