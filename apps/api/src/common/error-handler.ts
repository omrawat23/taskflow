import { randomUUID } from 'node:crypto'
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express'
import { isOperational } from './errors.js'
import { sendError } from './http.js'
import type { Logger } from './logger.js'

/** Sits between the last route and the error handler so unmatched paths land in the same funnel. */
export const notFound: RequestHandler = (req, res) => {
  sendError(req, res, 404, {
    code: 'ROUTE_NOT_FOUND',
    message: `No route for ${req.method} ${req.path}`,
  })
}

interface BodyParserError extends Error {
  type: string
  status: number
}

const isBodyParserError = (err: unknown): err is BodyParserError =>
  err instanceof Error &&
  typeof (err as Partial<BodyParserError>).type === 'string' &&
  typeof (err as Partial<BodyParserError>).status === 'number'

/**
 * body-parser runs before request-id and pino-http (security headers → cors → body-parser → …),
 * so errors raised there arrive without an id or a request logger. Give them both.
 */
const ensureRequestContext = (req: Request, res: Response, logger: Logger): Logger => {
  if (!req.id) {
    req.id = randomUUID()
    res.setHeader('x-request-id', req.id)
  }
  return req.log ?? logger.child({ reqId: req.id, method: req.method, url: req.originalUrl })
}

/**
 * Operational errors → mapped response + log. Programmer errors (bugs) → safe 500, then
 * `onProgrammerError` lets the process crash and restart in a clean state.
 */
export const errorHandler =
  (logger: Logger, onProgrammerError: (err: unknown) => void): ErrorRequestHandler =>
  (err, req, res, _next) => {
    const log = ensureRequestContext(req, res, logger)

    if (isOperational(err)) {
      log[err.status >= 500 ? 'error' : 'warn']({ err, code: err.code, ctx: err.ctx }, err.message)
      const details = err.ctx && 'details' in err.ctx ? err.ctx.details : undefined
      return sendError(req, res, err.status, {
        code: err.code,
        message: err.message,
        ...(details === undefined ? {} : { details }),
      })
    }

    if (isBodyParserError(err) && err.status < 500) {
      log.warn({ err }, 'malformed request body')
      return sendError(req, res, err.status, {
        code: err.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message: err.status === 413 ? 'Request body too large' : 'Malformed request body',
      })
    }

    log.fatal({ err }, 'programmer error: unhandled exception in request')
    sendError(req, res, 500, { code: 'INTERNAL', message: 'Something went wrong' })
    onProgrammerError(err)
  }
