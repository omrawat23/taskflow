import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { Db } from 'mongodb'
import { z } from 'zod'
import { sha256 } from './crypto.js'
import { isDuplicateKey } from './db.js'
import { Conflict, UnprocessableEntity, ValidationFailed } from './errors.js'

// Idempotency on every write: clients send `Idempotency-Key`; the server stores the response
// and replays it on retries. Records expire after 24h (TTL index, see migrations).

export const IDEMPOTENCY_COLLECTION = 'idempotency_keys'
const TTL_MS = 24 * 60 * 60 * 1000
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const IdempotencyKey = z.uuid('Idempotency-Key must be a UUID')

interface IdempotencyDoc {
  _id: string
  requestHash: string
  state: 'in_progress' | 'completed'
  response?: { status: number; body: unknown }
  expiresAt: Date
}

const fingerprint = (req: Request) =>
  sha256(JSON.stringify([req.method, req.baseUrl + req.path, req.body ?? null]))

export const idempotency = (db: Db): RequestHandler => {
  const col = db.collection<IdempotencyDoc>(IDEMPOTENCY_COLLECTION)

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!WRITE_METHODS.has(req.method)) return next()

    const parsedKey = IdempotencyKey.safeParse(req.header('idempotency-key'))
    if (!parsedKey.success) {
      throw new ValidationFailed({
        headers: { 'idempotency-key': ['A UUID Idempotency-Key header is required'] },
      })
    }

    // Scope keys per user so one client can never replay another client's response.
    const id = `${req.user?.id ?? 'anonymous'}:${parsedKey.data}`
    const requestHash = fingerprint(req)

    try {
      await col.insertOne({
        _id: id,
        requestHash,
        state: 'in_progress',
        expiresAt: new Date(Date.now() + TTL_MS),
      })
    } catch (err) {
      if (!isDuplicateKey(err)) throw err
      const existing = await col.findOne({ _id: id })
      if (!existing) throw new Conflict('IDEMPOTENCY_RACE', 'Retry the request')
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntity(
          'IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used with a different request',
        )
      }
      if (existing.state === 'in_progress' || !existing.response) {
        throw new Conflict(
          'IDEMPOTENCY_IN_PROGRESS',
          'A request with this key is still in progress',
        )
      }
      res.setHeader('idempotent-replayed', 'true')
      res.status(existing.response.status).json(existing.response.body)
      return
    }

    // Persist the response BEFORE it is sent, so a retry can never observe a half-finished record.
    const originalJson = res.json.bind(res)
    res.json = (body: unknown) => {
      const status = res.statusCode
      // 5xx: forget the key so the client can retry. Anything else is the final answer.
      const persist =
        status >= 500
          ? col.deleteOne({ _id: id })
          : col.updateOne({ _id: id }, { $set: { state: 'completed', response: { status, body } } })
      persist
        .catch((err: unknown) => req.log.error({ err }, 'failed to persist idempotency record'))
        .finally(() => originalJson(body))
      return res
    }

    next()
  }
}
