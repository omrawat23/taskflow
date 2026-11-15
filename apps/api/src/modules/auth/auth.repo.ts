import { type ClientSession, type Db, ObjectId } from 'mongodb'
import { type RefreshTokenDoc, RefreshTokenRecord, User, type UserDoc } from './auth.schema.js'

// Repositories at the data edge: they speak in entities (Zod-parsed), not documents.

const toUser = (doc: UserDoc): User =>
  User.parse({
    id: doc._id.toHexString(),
    email: doc.email,
    name: doc.name,
    createdAt: doc.createdAt.toISOString(),
  })

const toRefreshToken = (doc: RefreshTokenDoc): RefreshTokenRecord =>
  RefreshTokenRecord.parse({
    id: doc._id.toHexString(),
    userId: doc.userId.toHexString(),
    familyId: doc.familyId,
    expiresAt: doc.expiresAt,
    revokedAt: doc.revokedAt,
  })

export const usersRepo = (db: Db) => {
  const col = db.collection<UserDoc>('users')
  return {
    findById: async (id: string): Promise<User | null> => {
      const doc = await col.findOne({ _id: new ObjectId(id) })
      return doc ? toUser(doc) : null
    },
    findCredentialsByEmail: async (email: string) => {
      const doc = await col.findOne({ email })
      return doc ? { user: toUser(doc), passwordHash: doc.passwordHash } : null
    },
    create: async (
      cmd: { email: string; name: string; passwordHash: string },
      session: ClientSession,
    ): Promise<User> => {
      const doc: UserDoc = { _id: new ObjectId(), ...cmd, createdAt: new Date() }
      await col.insertOne(doc, { session })
      return toUser(doc)
    },
  }
}

export const refreshTokensRepo = (db: Db) => {
  const col = db.collection<RefreshTokenDoc>('refresh_tokens')
  return {
    create: async (
      cmd: { userId: string; familyId: string; tokenHash: string; expiresAt: Date },
      session?: ClientSession,
    ) => {
      await col.insertOne(
        {
          _id: new ObjectId(),
          userId: new ObjectId(cmd.userId),
          familyId: cmd.familyId,
          tokenHash: cmd.tokenHash,
          expiresAt: cmd.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        },
        session ? { session } : {},
      )
    },
    findByHash: async (tokenHash: string): Promise<RefreshTokenRecord | null> => {
      const doc = await col.findOne({ tokenHash })
      return doc ? toRefreshToken(doc) : null
    },
    /** Revokes one token if it is still active. Returns false when someone else got there first. */
    revoke: async (id: string, session: ClientSession): Promise<boolean> => {
      const result = await col.updateOne(
        { _id: new ObjectId(id), revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { session },
      )
      return result.modifiedCount === 1
    },
    revokeFamily: async (familyId: string) => {
      await col.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } })
    },
  }
}
