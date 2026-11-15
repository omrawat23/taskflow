import { randomUUID } from 'node:crypto'
import type { Express } from 'express'
import request from 'supertest'
import { inject } from 'vitest'
import { createApp } from '../app.js'
import { type Config, loadConfig } from '../common/config.js'
import { connectDatabase, type Database } from '../common/db.js'
import { createLogger } from '../common/logger.js'
import { migrate } from '../migrations/index.js'

export interface TestContext {
  app: Express
  database: Database
  config: Config
  lifecycle: { shuttingDown: boolean }
  programmerErrors: unknown[]
  close(): Promise<void>
}

/** Boots the real app in-process against a fresh database on the shared replica set. */
export const bootApp = async (
  overrides: Partial<Record<string, string>> = {},
): Promise<TestContext> => {
  const dbName = `test_${randomUUID().replaceAll('-', '')}`
  const uri = inject('mongoUri')
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    MONGO_URI: uri,
    JWT_ACCESS_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
    AUTH_RATE_LIMIT: '1000', // every test request comes from one IP
    ...overrides,
  })
  const logger = createLogger('silent')
  const database = await connectDatabase({ uri, dbName, timeoutMs: config.DB_TIMEOUT_MS })
  await migrate(database.db, logger) // migrations run on boot, like production deploys
  const lifecycle = { shuttingDown: false }
  const programmerErrors: unknown[] = []
  const app = createApp({
    config,
    logger,
    database,
    redis: null,
    lifecycle,
    onProgrammerError: (err) => programmerErrors.push(err),
  })
  return {
    app,
    database,
    config,
    lifecycle,
    programmerErrors,
    close: async () => {
      await database.db.dropDatabase()
      await database.close()
    },
  }
}

export const key = () => randomUUID()

/** Registers + logs in a user and returns a supertest agent that carries the session cookies. */
export const signedInAgent = async (app: Express, email = `user-${randomUUID()}@example.com`) => {
  const agent = request.agent(app)
  const password = 'correct horse battery'
  await agent
    .post('/api/v1/auth/register')
    .set('idempotency-key', key())
    .send({ email, name: 'Test User', password })
    .expect(201)
  const login = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200)
  return { agent, email, password, userId: login.body.data.id as string }
}
