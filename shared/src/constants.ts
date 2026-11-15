/** UI and agent output languages. English is the default. */
export const LANGS = ['en', 'tr'] as const;
export const DEFAULT_LANG = 'en' satisfies (typeof LANGS)[number];

/** A team has exactly one coordinator plus this many workers. */
export const MIN_WORKERS = 2;
export const MAX_WORKERS = 5;

/**
 * How an agent spends its free time in the 3D office (optional in team YAML).
 * Purely visual: it never changes what the agent writes.
 */
export const PERSONALITIES = ['social', 'diligent', 'coffee', 'calm', 'curious'] as const;

export const LLM_PROVIDERS = ['mock', 'gemini', 'anthropic'] as const;
