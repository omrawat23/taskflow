import type { ObjectId } from 'mongodb'
import { z } from 'zod'

export { LoginInput, RegisterInput, User } from '@taskflow/contracts'

/** Persistence shapes — never leave the repository. */
export interface UserDoc {
  _id: ObjectId
  email: string
  name: string
  passwordHash: string
  createdAt: Date
}

export interface RefreshTokenDoc {
  _id: ObjectId
  userId: ObjectId
  familyId: string
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
}

export const RefreshTokenRecord = z.object({
  id: z.string(),
  userId: z.string(),
  familyId: z.uuid(),
  expiresAt: z.date(),
  revokedAt: z.date().nullable(),
})
export type RefreshTokenRecord = z.infer<typeof RefreshTokenRecord>

export const AccessTokenClaims = z.object({ sub: z.string().regex(/^[a-f\d]{24}$/i) })

export const ACCESS_COOKIE = 'tf_at'
export const REFRESH_COOKIE = 'tf_rt'
