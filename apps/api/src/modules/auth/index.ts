import type { Redis } from 'ioredis'
import type { Config } from '../../common/config.js'
import type { Database } from '../../common/db.js'
import { idempotency } from '../../common/idempotency.js'
import { createLimiter } from '../../common/rate-limit.js'
import { createRequireAuth } from './auth.middleware.js'
import { createAuthRouter } from './auth.routes.js'
import { createAuthService } from './auth.service.js'
import { createAccessTokens } from './auth.tokens.js'

// The module's public surface. Other modules may use `requireAuth`, nothing else from here.
export const createAuthModule = (deps: {
  database: Database
  config: Config
  redis: Redis | null
}) => {
  const { database, config, redis } = deps
  const tokens = createAccessTokens(config.JWT_ACCESS_SECRET, config.ACCESS_TOKEN_TTL_SEC)
  const requireAuth = createRequireAuth(tokens)
  const service = createAuthService({ database, config, tokens })
  const router = createAuthRouter({
    service,
    config,
    requireAuth,
    idempotency: idempotency(database.db),
    authLimiter: createLimiter({
      redis,
      prefix: 'auth',
      windowMs: 15 * 60_000,
      limit: config.AUTH_RATE_LIMIT,
      by: 'ip',
    }),
  })
  return { router, requireAuth }
}

export type AuthModule = ReturnType<typeof createAuthModule>
