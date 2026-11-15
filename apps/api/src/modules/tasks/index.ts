import type { RequestHandler } from 'express'
import type { Redis } from 'ioredis'
import type { Database } from '../../common/db.js'
import { idempotency } from '../../common/idempotency.js'
import { createLimiter } from '../../common/rate-limit.js'
import { createTasksRouter } from './tasks.routes.js'
import { createTasksService } from './tasks.service.js'

export const createTasksModule = (deps: {
  database: Database
  redis: Redis | null
  requireAuth: RequestHandler
}) => {
  const service = createTasksService({ database: deps.database })
  const router = createTasksRouter({
    service,
    requireAuth: deps.requireAuth,
    userLimiter: createLimiter({
      redis: deps.redis,
      prefix: 'tasks',
      windowMs: 60_000,
      limit: 120,
      by: 'user',
    }),
    idempotency: idempotency(deps.database.db),
  })
  return { router }
}
