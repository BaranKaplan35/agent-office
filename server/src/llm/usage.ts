import type { TokenUsage } from '@agent-office/shared';

/**
 * Normalise a provider's token counts. Missing counts stay missing (the UI shows
 * "—") instead of turning into a misleading 0.
 */
export function toUsage(
  input: number | null | undefined,
  output: number | null | undefined,
): TokenUsage | undefined {
  const ok = (n: number | null | undefined): n is number => typeof n === 'number' && n >= 0;
  if (!ok(input) && !ok(output)) return undefined;
  return { inputTokens: ok(input) ? input : 0, outputTokens: ok(output) ? output : 0 };
}
