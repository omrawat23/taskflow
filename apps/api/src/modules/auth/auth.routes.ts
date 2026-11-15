import { type CookieOptions, type RequestHandler, type Response, Router } from 'express'
import type { Config } from '../../common/config.js'
import { endpoint, send, userId } from '../../common/http.js'
import { ACCESS_COOKIE, LoginInput, REFRESH_COOKIE, RegisterInput } from './auth.schema.js'
import type { AuthService, Session } from './auth.service.js'

// HTTP surface only: validate → delegate → serialize. Cookies are an HTTP concern, so they live here.

export const createAuthRouter = (deps: {
  service: AuthService
  config: Pick<Config, 'NODE_ENV' | 'ACCESS_TOKEN_TTL_SEC' | 'REFRESH_TOKEN_TTL_SEC'>
  requireAuth: RequestHandler
  idempotency: RequestHandler
  authLimiter: RequestHandler
}) => {
  const { service, config, requireAuth, idempotency, authLimiter } = deps
  const router = Router()

  const base: CookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
  }
  const accessCookie: CookieOptions = {
    ...base,
    path: '/api',
    maxAge: config.ACCESS_TOKEN_TTL_SEC * 1000,
  }
  const refreshCookie: CookieOptions = {
    ...base,
    path: '/api/v1/auth', // only ever sent to the auth endpoints
    maxAge: config.REFRESH_TOKEN_TTL_SEC * 1000,
  }

  const setSession = (res: Response, session: Session) => {
    res.cookie(ACCESS_COOKIE, session.accessToken, accessCookie)
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookie)
  }
  const clearSession = (res: Response) => {
    res.clearCookie(ACCESS_COOKIE, { ...accessCookie, maxAge: undefined })
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookie, maxAge: undefined })
  }

  // Registration is a resource write → idempotent. It does not open a session, so a replayed
  // response never has to carry Set-Cookie secrets.
  router.post(
    '/register',
    authLimiter,
    idempotency,
    endpoint({ body: RegisterInput }, async ({ body }, req, res) => {
      const user = await service.register(body)
      send(req, res, user, { status: 201 })
    }),
  )

  // Session endpoints are exempt from Idempotency-Key: their responses carry credentials
  // (Set-Cookie) that must never be persisted, and each call is safe to retry by design
  // (login → new session, refresh → rotation with re-use detection, logout → no-op if repeated).
  router.post(
    '/login',
    authLimiter,
    endpoint({ body: LoginInput }, async ({ body }, req, res) => {
      const session = await service.login(body)
      setSession(res, session)
      send(req, res, session.user)
    }),
  )

  router.post(
    '/refresh',
    authLimiter,
    endpoint({}, async (_input, req, res) => {
      const token = req.cookies?.[REFRESH_COOKIE]
      try {
        const session = await service.refresh(typeof token === 'string' ? token : '')
        setSession(res, session)
        send(req, res, session.user)
      } catch (err) {
        clearSession(res)
        throw err
      }
    }),
  )

  router.post(
    '/logout',
    endpoint({}, async (_input, req, res) => {
      const token = req.cookies?.[REFRESH_COOKIE]
      await service.logout(typeof token === 'string' ? token : undefined)
      clearSession(res)
      send(req, res, { loggedOut: true })
    }),
  )

  router.get(
    '/me',
    requireAuth,
    endpoint({}, async (_input, req, res) => {
      send(req, res, await service.me(userId(req)))
    }),
  )

  return router
}
