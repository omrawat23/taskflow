import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
import type { Redis } from 'ioredis'
import { pinoHttp } from 'pino-http'
import type { Config } from './common/config.js'
import type { Database } from './common/db.js'
import { errorHandler, notFound } from './common/error-handler.js'
import type { Logger } from './common/logger.js'
import { createLimiter } from './common/rate-limit.js'
import { requestId } from './common/request-id.js'
import { createAuthModule } from './modules/auth/index.js'
import { createHealthRouter, type Lifecycle } from './modules/health/index.js'
import { createTasksModule } from './modules/tasks/index.js'

export interface AppDeps {
  config: Config
  logger: Logger
  database: Database
  redis: Redis | null
  lifecycle: Lifecycle
  /** Called after a programmer error has been answered with a 500; the server crashes cleanly. */
  onProgrammerError: (err: unknown) => void
}

// Express bootstrap. Middleware order is deliberate:
// helmet → cors → body-parser → request-id → pino-http → rate-limit → auth → validate → routes → 404 → error-handler
export const createApp = (deps: AppDeps): Express => {
  const { config, logger, database, redis, lifecycle, onProgrammerError } = deps
  const app = express()

  app.disable('x-powered-by')
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(requestId)
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  )
  app.use(
    createLimiter({
      redis,
      prefix: 'global',
      windowMs: 15 * 60_000,
      limit: 600,
      by: 'ip',
      skip: (path) => path === '/health' || path === '/ready',
    }),
  )

  // auth + validate are applied per route inside each module.
  const auth = createAuthModule({ database, config, redis })
  const tasks = createTasksModule({ database, redis, requireAuth: auth.requireAuth })

  app.use(createHealthRouter({ database, lifecycle }))
  app.use('/api/v1/auth', auth.router)
  app.use('/api/v1/tasks', tasks.router)

  app.use(notFound)
  app.use(errorHandler(logger, onProgrammerError))
  return app
}
