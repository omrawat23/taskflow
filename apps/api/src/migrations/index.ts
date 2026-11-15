import type { Db } from 'mongodb'
import type { Logger } from '../common/logger.js'

// Migrations ship first: expand → migrate → deploy code → contract. Each step is idempotent and
// recorded in `_migrations`, so `pnpm migrate` can run on every deploy before the new code starts.
// Index what you query, not everything: each index below backs a concrete query.

interface Migration {
  id: string
  up(db: Db): Promise<void>
}

const ensureCollection = async (db: Db, name: string) => {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext()
  if (!exists) await db.createCollection(name)
}

export const migrations: Migration[] = [
  {
    id: '001-users',
    up: async (db) => {
      await ensureCollection(db, 'users')
      await db.collection('users').createIndex({ email: 1 }, { unique: true, name: 'email_unique' })
    },
  },
  {
    id: '002-tasks',
    up: async (db) => {
      await ensureCollection(db, 'tasks')
      // list(ownerId [, status]) sorted by _id desc with an _id cursor
      await db.collection('tasks').createIndex({ ownerId: 1, _id: -1 }, { name: 'owner_cursor' })
      await db
        .collection('tasks')
        .createIndex({ ownerId: 1, status: 1, _id: -1 }, { name: 'owner_status_cursor' })
    },
  },
  {
    id: '003-refresh-tokens',
    up: async (db) => {
      await ensureCollection(db, 'refresh_tokens')
      const col = db.collection('refresh_tokens')
      await col.createIndex({ tokenHash: 1 }, { unique: true, name: 'token_hash_unique' })
      await col.createIndex({ familyId: 1 }, { name: 'family' })
      await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl' })
    },
  },
  {
    id: '004-idempotency-keys',
    up: async (db) => {
      await ensureCollection(db, 'idempotency_keys')
      await db
        .collection('idempotency_keys')
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl' })
    },
  },
  {
    id: '005-outbox',
    up: async (db) => {
      await ensureCollection(db, 'outbox')
      await db.collection('outbox').createIndex({ status: 1, _id: 1 }, { name: 'status_order' })
    },
  },
]

export const migrate = async (db: Db, logger: Logger): Promise<void> => {
  const applied = db.collection<{ _id: string; appliedAt: Date }>('_migrations')
  for (const migration of migrations) {
    if (await applied.findOne({ _id: migration.id })) continue
    await migration.up(db)
    await applied.insertOne({ _id: migration.id, appliedAt: new Date() })
    logger.info({ migration: migration.id }, 'migration applied')
  }
}
