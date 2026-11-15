import { loadConfig } from '../common/config.js'
import { connectDatabase } from '../common/db.js'
import { createLogger } from '../common/logger.js'
import { migrate } from './index.js'

const config = loadConfig()
const logger = createLogger(config.LOG_LEVEL)
const database = await connectDatabase({ uri: config.MONGO_URI, timeoutMs: config.DB_TIMEOUT_MS })
try {
  await migrate(database.db, logger)
  logger.info('migrations complete')
} finally {
  await database.close()
}
