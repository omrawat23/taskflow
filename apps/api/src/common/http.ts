import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { z } from 'zod'
import { ValidationFailed } from './errors.js'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string }
    }
  }
}

// One response shape on every endpoint: { data, error, meta }.
export const send = <T>(
  req: Request,
  res: Response,
  data: T,
  { status = 200, meta = {} }: { status?: number; meta?: Record<string, unknown> } = {},
): void => {
  res.status(status).json({ data, error: null, meta: { requestId: String(req.id), ...meta } })
}

export const sendError = (
  req: Request,
  res: Response,
  status: number,
  error: { code: string; message: string; details?: unknown },
): void => {
  res.status(status).json({ data: null, error, meta: { requestId: String(req.id) } })
}

interface Schemas<B extends z.ZodType, Q extends z.ZodType, P extends z.ZodType> {
  body?: B
  query?: Q
  params?: P
}

interface Parsed<B extends z.ZodType, Q extends z.ZodType, P extends z.ZodType> {
  body: z.output<B>
  query: z.output<Q>
  params: z.output<P>
}

const parseOrThrow = <S extends z.ZodType>(
  schema: S,
  value: unknown,
  where: string,
): z.output<S> => {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ValidationFailed({ [where]: z.flattenError(result.error).fieldErrors })
  }
  return result.data
}

/**
 * Validate at the edge, then delegate. The handler receives typed, guaranteed input,
 * so nothing downstream needs defensive checks.
 */
export const endpoint =
  <
    B extends z.ZodType = z.ZodUnknown,
    Q extends z.ZodType = z.ZodUnknown,
    P extends z.ZodType = z.ZodUnknown,
  >(
    schemas: Schemas<B, Q, P>,
    handler: (input: Parsed<B, Q, P>, req: Request, res: Response) => Promise<void>,
  ): RequestHandler =>
  async (req: Request, res: Response, _next: NextFunction) => {
    const input = {
      body: schemas.body ? parseOrThrow(schemas.body, req.body, 'body') : req.body,
      query: schemas.query ? parseOrThrow(schemas.query, req.query, 'query') : req.query,
      params: schemas.params ? parseOrThrow(schemas.params, req.params, 'params') : req.params,
    } as Parsed<B, Q, P>
    await handler(input, req, res)
  }

/** The authenticated user id. Only call after `requireAuth`. */
export const userId = (req: Request): string => {
  if (!req.user) throw new Error('userId() called on an unauthenticated route')
  return req.user.id
}
