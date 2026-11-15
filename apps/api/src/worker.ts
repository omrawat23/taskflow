import { setTimeout as sleep } from 'node:timers/promises'
import { loadConfig } from './common/config.js'
import { connectDatabase } from './common/db.js'
import { createLogger } from './common/logger.js'
import { logPublisher, outboxRepo, processNextEvent, webhookPublisher } from './common/outbox.js'

// Outbox worker: polls the outbox and publishes events at-least-once, in order.
// Run as a separate process (`pnpm start:worker`) so publishing never competes with HTTP traffic.
const POLL_INTERVAL_MS = 1_000

const config = loadConfig()
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development').child({
  component: 'outbox-worker',
})
const database = await connectDatabase({ uri: config.MONGO_URI, timeoutMs: config.DB_TIMEOUT_MS })
const repo = outboxRepo(database.db)
const publisher =
  config.OUTBOX_WEBHOOK_URL && config.OUTBOX_WEBHOOK_SECRET
    ? webhookPublisher(
        {
          url: config.OUTBOX_WEBHOOK_URL,
          secret: config.OUTBOX_WEBHOOK_SECRET,
          timeoutMs: config.OUTBOUND_TIMEOUT_MS,
        },
        logger,
      )
    : logPublisher(logger)

const stop = new AbortController()

const loop = async () => {
  logger.info('outbox worker started')
  while (!stop.signal.aborted) {
    try {
      const hadWork = await processNextEvent(repo, publisher, logger)
      if (!hadWork)
        await sleep(POLL_INTERVAL_MS, undefined, { signal: stop.signal }).catch(() => {})
    } catch (err) {
      logger.error({ err }, 'outbox poll failed')
      await sleep(POLL_INTERVAL_MS * 5, undefined, { signal: stop.signal }).catch(() => {})
    }
  }
}

const running = loop()

const shutdown = async (code: number) => {
  if (stop.signal.aborted) return
  logger.info('worker shutting down')
  stop.abort() // finish the in-flight event, then stop polling
  await running
  publisher.close()
  await database.close()
  logger.flush(() => process.exit(code))
}

process.on('SIGTERM', () => void shutdown(0))
process.on('SIGINT', () => void shutdown(0))
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandled rejection')
  void shutdown(1)
})
