import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_'),
  SUPABASE_SECRET_KEY: z.string().startsWith('sb_secret_'),

  // OpenAI
  OPENAI_API_KEY: z.string().startsWith('sk-'),

  // Sentry
  SENTRY_DSN: z.string().url().optional(),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().default(3001),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Parse and validate environment variables.
 * Returns cached result on subsequent calls.
 * Throws on validation failure with detailed error messages.
 */
export function env(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Environment validation failed:\n${missing.join('\n')}`);
  }

  _env = result.data;
  return _env;
}
