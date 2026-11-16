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

/**
 * The coordinator may ask before planning when a task is unclear: at most this many
 * rounds, then it plans with reasonable assumptions.
 */
export const MAX_CLARIFICATIONS = 2;
export const MAX_CLARIFYING_QUESTIONS = 3;

/** Model backends. `mock` needs nothing; the others are chosen per agent or in `.env`. */
export const LLM_PROVIDERS = ['mock', 'gemini', 'anthropic', 'ollama', 'openrouter'] as const;
