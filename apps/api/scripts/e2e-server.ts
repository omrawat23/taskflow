// Boots the real API against a throwaway MongoDB replica set for Playwright E2E runs.
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/common/config.js'
import { connectDatabase } from '../src/common/db.js'
import { createLogger } from '../src/common/logger.js'
import { migrate } from '../src/migrations/index.js'

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
})
const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  PORT: '4000',
  MONGO_URI: replSet.getUri('taskflow_e2e'),
  JWT_ACCESS_SECRET: 'e2e-secret-that-is-long-enough-for-hs256-signing',
  AUTH_RATE_LIMIT: '1000',
})
const logger = createLogger(config.LOG_LEVEL)
const database = await connectDatabase({ uri: config.MONGO_URI, timeoutMs: config.DB_TIMEOUT_MS })
await migrate(database.db, logger)

const app = createApp({
  config,
  logger,
  database,
  redis: null,
  lifecycle: { shuttingDown: false },
  onProgrammerError: (err) => logger.fatal({ err }, 'programmer error during e2e'),
})
const server = app.listen(config.PORT, () => logger.warn({ port: config.PORT }, 'e2e api ready'))

const stop = async () => {
  server.close()
  await database.close()
  await replSet.stop()
  process.exit(0)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
