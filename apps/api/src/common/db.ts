import { availableParallelism } from 'node:os'
import { type ClientSession, type Db, MongoClient, MongoServerError } from 'mongodb'

// The single MongoDB adapter. Modules receive `Database` and never construct clients themselves.
export interface Database {
  readonly db: Db
  /** Runs `fn` inside one multi-document transaction (state change + outbox event commit together). */
  withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T>
  ping(): Promise<void>
  close(): Promise<void>
}

export interface DbOptions {
  uri: string
  timeoutMs: number
  dbName?: string
}

export const connectDatabase = async ({ uri, timeoutMs, dbName }: DbOptions): Promise<Database> => {
  // Pool everything: one shared pool per process, sized to cores × 4, never a client per request.
  const client = new MongoClient(uri, {
    maxPoolSize: availableParallelism() * 4,
    serverSelectionTimeoutMS: Math.min(timeoutMs, 5_000),
    timeoutMS: timeoutMs, // bounds every operation (client-side operation timeout)
    appName: 'taskflow-api',
  })
  await client.connect()
  const db = client.db(dbName)

  return {
    db,
    withTransaction: (fn) =>
      client.withSession((session) =>
        session.withTransaction(() => fn(session), {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
        }),
      ),
    ping: async () => {
      await db.command({ ping: 1 })
    },
    close: () => client.close(),
  }
}

export type { ClientSession, Db }

/** Mongo duplicate-key error (unique index violation). */
export const isDuplicateKey = (err: unknown): boolean =>
  err instanceof MongoServerError && err.code === 11000
