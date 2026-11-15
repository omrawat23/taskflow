import { errors, jwtVerify, SignJWT } from 'jose'
import { Unauthorized } from '../../common/errors.js'
import { AccessTokenClaims } from './auth.schema.js'

// Short-lived access JWTs (HS256). Used only by the auth module, so the wrapper lives here.
const ISSUER = 'taskflow-api'
const AUDIENCE = 'taskflow-web'

export const createAccessTokens = (secret: string, ttlSec: number) => {
  const key = new TextEncoder().encode(secret)
  return {
    sign: (userId: string): Promise<string> =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${ttlSec}s`)
        .sign(key),

    verify: async (token: string): Promise<{ userId: string }> => {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ['HS256'],
        })
        return { userId: AccessTokenClaims.parse(payload).sub }
      } catch (err) {
        if (err instanceof errors.JWTExpired) throw new Unauthorized('Session expired')
        throw new Unauthorized('Invalid session')
      }
    },
  }
}
export type AccessTokens = ReturnType<typeof createAccessTokens>
