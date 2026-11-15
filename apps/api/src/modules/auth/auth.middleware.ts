import type { RequestHandler } from 'express'
import { z } from 'zod'
import { Unauthorized } from '../../common/errors.js'
import { ACCESS_COOKIE } from './auth.schema.js'
import type { AccessTokens } from './auth.tokens.js'

const CookieValue = z.string().min(1).max(4096)

/** Route guard: reads the httpOnly access cookie and attaches `req.user`. */
export const createRequireAuth =
  (tokens: AccessTokens): RequestHandler =>
  async (req, _res, next) => {
    const token = CookieValue.safeParse(req.cookies?.[ACCESS_COOKIE])
    if (!token.success) throw new Unauthorized()
    const { userId } = await tokens.verify(token.data)
    req.user = { id: userId }
    next()
  }
