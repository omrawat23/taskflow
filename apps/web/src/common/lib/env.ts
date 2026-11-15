import { z } from 'zod'

// Env vars are a trust boundary too: validate once at startup.
const Env = z.object({
  /** Empty = same origin (dev proxy / reverse proxy in production). */
  VITE_API_URL: z.union([z.literal(''), z.url()]).default(''),
  VITE_API_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
})

export const env = Env.parse(import.meta.env)
