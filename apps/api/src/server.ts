import { Redis } from 'ioredis'
import { createApp } from './app.js'
import { loadConfig } from './common/config.js'
import { connectDatabase } from './common/db.js'
import { createLogger } from './common/logger.js'

// Graceful start & shutdown.
const config = loadConfig()
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development')
const lifecycle = { shuttingDown: false }

const database = await connectDatabase({ uri: config.MONGO_URI, timeoutMs: config.DB_TIMEOUT_MS })
const redis = config.REDIS_URL
  ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false })
  : null
if (!redis) logger.warn('REDIS_URL not set: using in-memory rate limiting (development only)')

let shutdown: (code: number) => Promise<void> = async (code) => process.exit(code)

const app = createApp({
  config,
  logger,
  database,
  redis,
  lifecycle,
  onProgrammerError: () => void shutdown(1),
})

const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'api listening'))
server.requestTimeout = config.REQUEST_TIMEOUT_MS // inbound bound > DB bound > outbound bound
server.headersTimeout = config.REQUEST_TIMEOUT_MS + 1_000

// SIGTERM → stop accepting → drain in-flight (with timeout) → close DB pool → flush logger → exit
shutdown = async (code: number) => {
  if (lifecycle.shuttingDown) return
  lifecycle.shuttingDown = true // /ready now returns 503 so the load balancer stops routing here
  logger.info({ code }, 'shutting down')

  const forceTimer = setTimeout(() => {
    logger.warn('drain timeout reached, closing remaining connections')
    server.closeAllConnections()
  }, config.SHUTDOWN_TIMEOUT_MS)
  forceTimer.unref()

  await new Promise<void>((resolve) => {
    server.close(() => resolve())
    server.closeIdleConnections()
  })
  clearTimeout(forceTimer)

  await database.close().catch((err: unknown) => logger.error({ err }, 'error closing database'))
  await redis?.quit().catch((err: unknown) => logger.error({ err }, 'error closing redis'))
  logger.info('shutdown complete')
  logger.flush(() => process.exit(code))
}

process.on('SIGTERM', () => void shutdown(0))
process.on('SIGINT', () => void shutdown(0))
// Programmer errors outside a request: log, then crash so the process manager restarts us clean.
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandled rejection')
  void shutdown(1)
})
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception')
  void shutdown(1)
})
