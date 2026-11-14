import type { LLMProvider } from './types';

/** Run at most `max` async jobs at once; the rest wait in FIFO order. */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await job();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

/** Wrap a provider so no more than `max` model calls run in parallel (free tiers are strict). */
export function withConcurrencyLimit(provider: LLMProvider, max: number): LLMProvider {
  const run = createLimiter(max);
  return {
    name: provider.name,
    generate: (request) => run(() => provider.generate(request)),
  };
}
