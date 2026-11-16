/**
 * Model labels, call metrics and task totals (pure). Numbers are formatted with
 * `Intl` in the viewer's language; the words around them come from i18n.
 */
import type { CallMetrics, Lang, LLMProviderName, ResolvedLLM, Task } from '@agent-office/shared';

/** "gemini · gemini-3.6-flash", or just "mock" for the mock provider. */
export function modelLabel(llm: Pick<ResolvedLLM, 'provider' | 'model'>): string {
  if (llm.provider === 'mock' || !llm.model || llm.model === llm.provider) return llm.provider;
  return `${llm.provider} · ${llm.model}`;
}

/** 850 → "850", 1234 → "1.2K" (en) / "1,2 B" (tr). */
export function formatTokens(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang, {
    notation: 'compact',
    maximumFractionDigits: n >= 1000 && n < 10_000 ? 1 : 0,
  }).format(n);
}

/**
 * 430 → "0.4s", 4321 → "4.3s", 42_000 → "42s", 125_000 → "2m 5s" in English;
 * Turkish uses the short units ("2 dk 5 sn"): its narrow minute "d" reads like "day".
 */
export function formatDuration(ms: number, lang: Lang): string {
  const seconds = Math.max(0, ms) / 1000;
  // Short Turkish units end in a dot ("4,3 sn."); a label reads better without it.
  const unit = (u: 'second' | 'minute', digits = 0) => {
    const format = new Intl.NumberFormat(lang, {
      style: 'unit',
      unit: u,
      unitDisplay: lang === 'tr' ? 'short' : 'narrow',
      maximumFractionDigits: digits,
    });
    return (n: number) => format.format(n).replace(/\.$/, '');
  };
  if (seconds < 10) return unit('second', 1)(Math.round(seconds * 10) / 10);
  if (seconds < 60) return unit('second')(Math.round(seconds));
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return rest === 0
    ? unit('minute')(minutes)
    : `${unit('minute')(minutes)} ${unit('second')(rest)}`;
}

export interface TotalsRow {
  provider: LLMProviderName;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** Calls whose provider reported no token counts (their tokens are unknown, not 0). */
  uncounted: number;
}

export interface TaskTotals {
  /** One row per model, in the order the models were first used. */
  rows: TotalsRow[];
  total: Omit<TotalsRow, 'provider' | 'model'>;
}

/** Every model call of a task: planning (and questions), each report version, each final version. */
export function taskCalls(task: Task): CallMetrics[] {
  const versions = [...task.subtasks.flatMap((s) => s.versions), ...(task.final?.versions ?? [])];
  return [...task.planCalls, ...versions.flatMap((v) => (v.metrics ? [v.metrics] : []))];
}

/** Tokens and time per model for the whole task, plus the grand total. */
export function taskTotals(task: Task | null): TaskTotals {
  const empty = { calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0, uncounted: 0 };
  const rows = new Map<string, TotalsRow>();
  const total = { ...empty };
  for (const call of task ? taskCalls(task) : []) {
    const key = `${call.provider}\u0000${call.model}`;
    let row = rows.get(key);
    if (!row) rows.set(key, (row = { provider: call.provider, model: call.model, ...empty }));
    for (const target of [row, total]) {
      target.calls += 1;
      target.durationMs += call.durationMs;
      if (call.usage) {
        target.inputTokens += call.usage.inputTokens;
        target.outputTokens += call.usage.outputTokens;
      } else {
        target.uncounted += 1;
      }
    }
  }
  return { rows: [...rows.values()], total };
}
