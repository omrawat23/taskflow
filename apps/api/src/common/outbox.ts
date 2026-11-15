import { type ClientSession, type Db, ObjectId } from 'mongodb'
import { z } from 'zod'
import { hmacSha256 } from './crypto.js'
import type { Logger } from './logger.js'
import { type Breaker, circuitBreaker, NonRetryableError, retry } from './resilience.js'

// Transactional outbox: the state change and its event are written in ONE transaction.
// A separate worker publishes events (at-least-once, in order). No dual writes.

export const OutboxEvent = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.unknown(),
  attempts: z.number().int(),
  createdAt: z.date(),
})
export type OutboxEvent = z.infer<typeof OutboxEvent>

interface OutboxDoc {
  _id: ObjectId
  type: string
  payload: unknown
  status: 'pending' | 'published' | 'failed'
  attempts: number
  availableAt: Date
  lockedUntil: Date | null
  lastError?: string
  createdAt: Date
  publishedAt?: Date
}

const toEvent = (doc: OutboxDoc): OutboxEvent =>
  OutboxEvent.parse({
    id: doc._id.toHexString(),
    type: doc.type,
    payload: doc.payload,
    attempts: doc.attempts,
    createdAt: doc.createdAt,
  })

export const OUTBOX_COLLECTION = 'outbox'
const LOCK_MS = 30_000

export const outboxRepo = (db: Db) => {
  const col = db.collection<OutboxDoc>(OUTBOX_COLLECTION)
  return {
    /** Must be called with the same session as the state change it describes. */
    enqueue: async (event: { type: string; payload: unknown }, session: ClientSession) => {
      const now = new Date()
      await col.insertOne(
        {
          _id: new ObjectId(),
          type: event.type,
          payload: event.payload,
          status: 'pending',
          attempts: 0,
          availableAt: now,
          lockedUntil: null,
          createdAt: now,
        },
        { session },
      )
    },

    /**
     * Claims the OLDEST pending event. If it is backing off or locked by another worker we wait
     * instead of skipping ahead, which is what keeps delivery in order.
     */
    claimNext: async (now = new Date()): Promise<OutboxEvent | null> => {
      const oldest = await col.findOne({ status: 'pending' }, { sort: { _id: 1 } })
      if (!oldest || oldest.availableAt > now) return null
      if (oldest.lockedUntil && oldest.lockedUntil > now) return null
      const claimed = await col.findOneAndUpdate(
        {
          _id: oldest._id,
          status: 'pending',
          $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
        },
        { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
        { returnDocument: 'after' },
      )
      return claimed ? toEvent(claimed) : null
    },

    markPublished: async (id: string) => {
      await col.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'published', publishedAt: new Date(), lockedUntil: null } },
      )
    },

    markFailedAttempt: async (id: string, error: string, retryAt: Date, deadLetter: boolean) => {
      await col.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: deadLetter ? 'failed' : 'pending',
            availableAt: retryAt,
            lockedUntil: null,
            lastError: error.slice(0, 500),
          },
        },
      )
    },
  }
}
export type OutboxRepo = ReturnType<typeof outboxRepo>

// ---------- Processing (used by the worker) ----------

export const MAX_ATTEMPTS = 10

/** Publishes at most one event. Returns true if there was work, so the caller can drain quickly. */
export const processNextEvent = async (
  repo: OutboxRepo,
  publisher: EventPublisher,
  logger: Logger,
): Promise<boolean> => {
  const event = await repo.claimNext()
  if (!event) return false
  try {
    await publisher.publish(event)
    await repo.markPublished(event.id)
  } catch (err) {
    const deadLetter = event.attempts >= MAX_ATTEMPTS
    const delayMs = Math.min(60_000, 1_000 * 2 ** (event.attempts - 1))
    await repo.markFailedAttempt(event.id, String(err), new Date(Date.now() + delayMs), deadLetter)
    logger[deadLetter ? 'error' : 'warn'](
      { err, eventId: event.id, eventType: event.type, attempts: event.attempts },
      deadLetter ? 'outbox event moved to dead letter' : 'outbox publish failed, will retry',
    )
  }
  return true
}

// ---------- Publishers (adapters at the edge) ----------

export interface EventPublisher {
  publish(event: OutboxEvent): Promise<void>
  close(): void
}

export const logPublisher = (logger: Logger): EventPublisher => ({
  publish: async (event) => {
    logger.info({ eventId: event.id, eventType: event.type }, 'event published')
  },
  close: () => {},
})

export const webhookPublisher = (
  opts: { url: string; secret: string; timeoutMs: number },
  logger: Logger,
): EventPublisher => {
  const post = async (event: OutboxEvent) => {
    const body = JSON.stringify({
      id: event.id,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
    })
    const res = await fetch(opts.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-event-id': event.id,
        'x-event-type': event.type,
        'x-signature': `sha256=${hmacSha256(opts.secret, body)}`,
      },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs), // bound every network call
    })
    if (res.status >= 400 && res.status < 500) {
      throw new NonRetryableError(`Webhook rejected event with ${res.status}`) // never retry 4xx
    }
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`)
  }

  const breaker: Breaker<[OutboxEvent], void> = circuitBreaker(
    (event: OutboxEvent) =>
      retry(() => post(event), { attempts: 3, baseDelayMs: 200, maxDelayMs: 2_000 }),
    { name: 'outbox-webhook', resetTimeoutMs: 30_000, errorThresholdPercentage: 50 },
  )

  return {
    publish: async (event) => {
      await breaker.fire(event)
      logger.debug({ eventId: event.id, eventType: event.type }, 'event delivered to webhook')
    },
    close: () => breaker.shutdown(),
  }
}
