import { LLM_PROVIDERS } from '@agent-office/shared';
import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    /** Explicit API port; wins everywhere. Also read by the Vite dev proxy. */
    SERVER_PORT: z.coerce.number().int().positive().optional(),
    /** Set by hosting platforms (Render, Fly…). Only honoured in production. */
    PORT: z.coerce.number().int().positive().optional(),
    LLM_PROVIDER: z.enum(LLM_PROVIDERS).default('mock'),
    LLM_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    /** Mock answers wait a random time in this range so the office has time to animate. */
    MOCK_MIN_DELAY_MS: z.coerce.number().int().min(0).default(1500),
    MOCK_MAX_DELAY_MS: z.coerce.number().int().min(0).default(4000),
    /**
     * Extra wait before a mock plan or first work report, roughly the time the agent
     * needs to walk to the desk and sit down, so the report never lands mid-walk.
     */
    MOCK_WALK_IN_MS: z.coerce.number().int().min(0).default(4500),
    GEMINI_API_KEY: optionalString,
    GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
    ANTHROPIC_API_KEY: optionalString,
    ANTHROPIC_MODEL: z.string().default('claude-haiku-5-5'),
  })
  .superRefine((env, ctx) => {
    if (env.MOCK_MIN_DELAY_MS > env.MOCK_MAX_DELAY_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['MOCK_MIN_DELAY_MS'],
        message: 'must not be greater than MOCK_MAX_DELAY_MS',
      });
    }
    if (env.LLM_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'is required when LLM_PROVIDER=gemini',
      });
    }
    if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'is required when LLM_PROVIDER=anthropic',
      });
    }
  })
  .transform((env) => ({
    ...env,
    // In development tools often export PORT for the *frontend* dev server,
    // so the API only follows PORT in production builds.
    port: env.SERVER_PORT ?? (env.NODE_ENV === 'production' ? env.PORT : undefined) ?? 3001,
  }));

export type Env = z.output<typeof EnvSchema>;

/** Parse environment variables. Throws one readable error listing every problem. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
  }
  return result.data;
}
