import { z } from 'zod'

// Env vars are a trust boundary: parse them once at startup and fail fast on anything invalid.
const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    MONGO_URI: z.url({ protocol: /^mongodb(\+srv)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
    CORS_ORIGIN: z
      .string()
      .default('http://localhost:5173')
      .transform((v) => v.split(',').map((o) => o.trim()))
      .pipe(z.array(z.url()).min(1)),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(604_800),
    OUTBOX_WEBHOOK_URL: z.url().optional(),
    OUTBOX_WEBHOOK_SECRET: z.string().min(32).optional(),
    /** Login/register/refresh attempts per IP per 15 minutes. */
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    DB_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    OUTBOUND_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.REDIS_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'REDIS_URL is required in production',
      })
    }
    if (env.OUTBOX_WEBHOOK_URL && !env.OUTBOX_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['OUTBOX_WEBHOOK_SECRET'],
        message: 'OUTBOX_WEBHOOK_SECRET is required when OUTBOX_WEBHOOK_URL is set',
      })
    }
    // Bound every network call: outbound < DB < inbound.
    if (
      !(env.OUTBOUND_TIMEOUT_MS < env.DB_TIMEOUT_MS && env.DB_TIMEOUT_MS < env.REQUEST_TIMEOUT_MS)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['REQUEST_TIMEOUT_MS'],
        message: 'Timeouts must satisfy OUTBOUND_TIMEOUT_MS < DB_TIMEOUT_MS < REQUEST_TIMEOUT_MS',
      })
    }
  })

export type Config = z.infer<typeof Env>

const emptyToUndefined = (env: NodeJS.ProcessEnv) =>
  Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === '' ? undefined : v]))

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const parsed = Env.safeParse(emptyToUndefined(env))
  if (!parsed.success) {
    // The logger is not configured yet; this is the one place stderr is written directly.
    process.stderr.write(`Invalid environment:\n${z.prettifyError(parsed.error)}\n`)
    process.exit(1)
  }
  return parsed.data
}
