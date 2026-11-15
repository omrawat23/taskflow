import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, type TestContext } from '../test/harness.js'
import { createLogger } from './logger.js'
import {
  type EventPublisher,
  MAX_ATTEMPTS,
  type OutboxEvent,
  outboxRepo,
  processNextEvent,
} from './outbox.js'

let ctx: TestContext
const logger = createLogger('silent')

beforeAll(async () => {
  ctx = await bootApp()
})
afterAll(() => ctx.close())

const enqueue = (type: string) =>
  ctx.database.withTransaction((session) =>
    outboxRepo(ctx.database.db).enqueue({ type, payload: { type } }, session),
  )

const collectingPublisher = (): EventPublisher & { seen: OutboxEvent[] } => {
  const seen: OutboxEvent[] = []
  return { seen, publish: async (e) => void seen.push(e), close: () => {} }
}

describe('outbox worker', () => {
  it('publishes pending events in insertion order and marks them published', async () => {
    await enqueue('first')
    await enqueue('second')
    await enqueue('third')
    const repo = outboxRepo(ctx.database.db)
    const publisher = collectingPublisher()

    while (await processNextEvent(repo, publisher, logger)) {}

    expect(publisher.seen.map((e) => e.type)).toEqual(['first', 'second', 'third'])
    const pending = await ctx.database.db.collection('outbox').countDocuments({ status: 'pending' })
    expect(pending).toBe(0)
  })

  it('backs off after a failed publish instead of skipping ahead to newer events', async () => {
    await enqueue('flaky')
    await enqueue('after-flaky')
    const repo = outboxRepo(ctx.database.db)
    const failing: EventPublisher = {
      publish: async () => {
        throw new Error('broker down')
      },
      close: () => {},
    }

    expect(await processNextEvent(repo, failing, logger)).toBe(true)
    // The failed event is now backing off; the newer one must wait behind it.
    expect(await processNextEvent(repo, collectingPublisher(), logger)).toBe(false)
    const flaky = await ctx.database.db.collection('outbox').findOne({ type: 'flaky' })
    expect(flaky).toMatchObject({ status: 'pending', attempts: 1, lastError: 'Error: broker down' })
  })

  it(`moves an event to dead letter after ${MAX_ATTEMPTS} failed attempts`, async () => {
    await ctx.database.db
      .collection('outbox')
      .updateOne(
        { type: 'flaky' },
        { $set: { attempts: MAX_ATTEMPTS - 1, availableAt: new Date(0) } },
      )
    const failing: EventPublisher = {
      publish: async () => {
        throw new Error('still down')
      },
      close: () => {},
    }
    await processNextEvent(outboxRepo(ctx.database.db), failing, logger)
    const flaky = await ctx.database.db.collection('outbox').findOne({ type: 'flaky' })
    expect(flaky?.status).toBe('failed')

    // With the poison event out of the way, the queue moves again.
    const publisher = collectingPublisher()
    while (await processNextEvent(outboxRepo(ctx.database.db), publisher, logger)) {}
    expect(publisher.seen.map((e) => e.type)).toEqual(['after-flaky'])
  })
})
