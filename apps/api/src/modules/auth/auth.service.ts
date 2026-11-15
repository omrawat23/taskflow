import { randomUUID } from 'node:crypto'
import type { Config } from '../../common/config.js'
import { randomToken, sha256 } from '../../common/crypto.js'
import { type Database, isDuplicateKey } from '../../common/db.js'
import { Conflict, NotFound, Unauthorized } from '../../common/errors.js'
import { outboxRepo } from '../../common/outbox.js'
import { dummyPasswordHash, hashPassword, verifyPassword } from '../../common/password.js'
import { refreshTokensRepo, usersRepo } from './auth.repo.js'
import type { LoginInput, RegisterInput, User } from './auth.schema.js'
import type { AccessTokens } from './auth.tokens.js'

// Business logic, pure of HTTP: no req/res, no cookies. Routes translate.

export interface Session {
  user: User
  accessToken: string
  refreshToken: string
}

type RegisterCmd = { email: string; name: string; password: string }
type LoginCmd = { email: string; password: string }

export const createAuthService = (deps: {
  database: Database
  config: Pick<Config, 'REFRESH_TOKEN_TTL_SEC'>
  tokens: AccessTokens
}) => {
  const { database, config, tokens } = deps
  const users = usersRepo(database.db)
  const refreshTokens = refreshTokensRepo(database.db)
  const outbox = outboxRepo(database.db)

  const startSession = async (user: User, familyId: string): Promise<Session> => {
    const refreshToken = randomToken()
    await refreshTokens.create({
      userId: user.id,
      familyId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_SEC * 1000),
    })
    return { user, accessToken: await tokens.sign(user.id), refreshToken }
  }

  return {
    register: async ({ email, name, password }: RegisterCmd): Promise<User> => {
      const passwordHash = await hashPassword(password)
      try {
        return await database.withTransaction(async (session) => {
          const user = await users.create({ email, name, passwordHash }, session)
          await outbox.enqueue({ type: 'user.registered', payload: { userId: user.id } }, session)
          return user
        })
      } catch (err) {
        if (isDuplicateKey(err))
          throw new Conflict('EMAIL_TAKEN', 'An account with this email already exists')
        throw err
      }
    },

    login: async ({ email, password }: LoginCmd): Promise<Session> => {
      const credentials = await users.findCredentialsByEmail(email)
      // Always run a full argon2 verify so response time doesn't reveal registered emails.
      if (!credentials) {
        await verifyPassword(await dummyPasswordHash(), password) // result intentionally ignored
        throw new Unauthorized('Invalid email or password')
      }
      if (!(await verifyPassword(credentials.passwordHash, password))) {
        throw new Unauthorized('Invalid email or password')
      }
      return startSession(credentials.user, randomUUID())
    },

    /** Rotates the refresh token. Re-use of a revoked token revokes the whole session family. */
    refresh: async (refreshToken: string): Promise<Session> => {
      const record = await refreshTokens.findByHash(sha256(refreshToken))
      if (!record || record.expiresAt <= new Date()) throw new Unauthorized('Session expired')
      if (record.revokedAt) {
        await refreshTokens.revokeFamily(record.familyId)
        throw new Unauthorized('Session revoked')
      }
      const user = await users.findById(record.userId)
      if (!user) throw new Unauthorized('Session expired')

      const rotated = await database.withTransaction((session) =>
        refreshTokens.revoke(record.id, session),
      )
      if (!rotated) {
        // A concurrent refresh already rotated this token: treat as re-use.
        await refreshTokens.revokeFamily(record.familyId)
        throw new Unauthorized('Session revoked')
      }
      return startSession(user, record.familyId)
    },

    logout: async (refreshToken: string | undefined): Promise<void> => {
      if (!refreshToken) return
      const record = await refreshTokens.findByHash(sha256(refreshToken))
      if (record) await refreshTokens.revokeFamily(record.familyId)
    },

    me: async (userId: string): Promise<User> => {
      const user = await users.findById(userId)
      if (!user) throw new NotFound('User')
      return user
    },
  }
}
export type AuthService = ReturnType<typeof createAuthService>
export type { LoginInput, RegisterInput }
