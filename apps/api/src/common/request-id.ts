import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { z } from 'zod'

// One request id per request: accepted from the caller (if well-formed), generated otherwise,
// returned on every response and attached to every log line by pino-http.
const IncomingRequestId = z.string().regex(/^[\w-]{8,128}$/)

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = IncomingRequestId.safeParse(req.header('x-request-id'))
  req.id = incoming.success ? incoming.data : randomUUID()
  res.setHeader('x-request-id', req.id)
  next()
}
