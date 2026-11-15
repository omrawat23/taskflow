import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, key, signedInAgent, type TestContext } from '../../test/harness.js'

let ctx: TestContext
let agent: Awaited<ReturnType<typeof signedInAgent>>['agent']

beforeAll(async () => {
  ctx = await bootApp()
  ;({ agent } = await signedInAgent(ctx.app))
})
afterAll(() => ctx.close())

const createTask = (title: string, idempotencyKey = key()) =>
  agent.post('/api/v1/tasks').set('idempotency-key', idempotencyKey).send({ title })

describe('tasks API', () => {
  it('returns 401 without a session', async () => {
    const res = await request(ctx.app).get('/api/v1/tasks')
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ data: null, error: { code: 'UNAUTHORIZED' } })
  })

  it('creates a task, returns 201 and enqueues task.created in the same transaction', async () => {
    const res = await createTask('Write the architecture doc')
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      title: 'Write the architecture doc',
      status: 'todo',
      description: '',
    })
    const events = await ctx.database.db
      .collection('outbox')
      .find({ type: 'task.created', 'payload.id': res.body.data.id })
      .toArray()
    expect(events).toHaveLength(1)
  })

  it('replays the stored response on a duplicate Idempotency-Key instead of writing twice', async () => {
    const idempotencyKey = key()
    const first = await createTask('Pay invoice', idempotencyKey)
    const retry = await createTask('Pay invoice', idempotencyKey)

    expect(retry.status).toBe(201)
    expect(retry.headers['idempotent-replayed']).toBe('true')
    expect(retry.body.data.id).toBe(first.body.data.id)
    expect(await ctx.database.db.collection('tasks').countDocuments({ title: 'Pay invoice' })).toBe(
      1,
    )
  })

  it('returns 422 when an Idempotency-Key is reused with a different body', async () => {
    const idempotencyKey = key()
    await createTask('Original', idempotencyKey)
    const reused = await createTask('Different', idempotencyKey)
    expect(reused.status).toBe(422)
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
  })

  it('pages through tasks with a cursor, newest first, without duplicates', async () => {
    const { agent: fresh } = await signedInAgent(ctx.app)
    for (const title of ['one', 'two', 'three', 'four', 'five']) {
      await fresh.post('/api/v1/tasks').set('idempotency-key', key()).send({ title }).expect(201)
    }
    const page1 = await fresh.get('/api/v1/tasks?limit=2')
    expect(page1.body.data.map((t: { title: string }) => t.title)).toEqual(['five', 'four'])
    const page2 = await fresh.get(`/api/v1/tasks?limit=2&cursor=${page1.body.meta.nextCursor}`)
    expect(page2.body.data.map((t: { title: string }) => t.title)).toEqual(['three', 'two'])
    const page3 = await fresh.get(`/api/v1/tasks?limit=2&cursor=${page2.body.meta.nextCursor}`)
    expect(page3.body.data.map((t: { title: string }) => t.title)).toEqual(['one'])
    expect(page3.body.meta.nextCursor).toBeNull()
  })

  it('updates the status, filters by it, and records task.updated', async () => {
    const created = await createTask('Ship it')
    const id = created.body.data.id
    const updated = await agent
      .patch(`/api/v1/tasks/${id}`)
      .set('idempotency-key', key())
      .send({ status: 'done' })
    expect(updated.status).toBe(200)
    expect(updated.body.data.status).toBe('done')

    const done = await agent.get('/api/v1/tasks?status=done')
    expect(done.body.data.map((t: { id: string }) => t.id)).toContain(id)
    const event = await ctx.database.db
      .collection('outbox')
      .findOne({ type: 'task.updated', 'payload.task.id': id })
    expect(event?.payload.changed).toEqual(['status'])
  })

  it("returns 404 for another user's task so ownership is never leaked", async () => {
    const mine = await createTask('Private')
    const { agent: stranger } = await signedInAgent(ctx.app)
    const res = await stranger.get(`/api/v1/tasks/${mine.body.data.id}`)
    expect(res.status).toBe(404)
    const del = await stranger
      .delete(`/api/v1/tasks/${mine.body.data.id}`)
      .set('idempotency-key', key())
    expect(del.status).toBe(404)
  })

  it('deletes a task and then reports it as not found', async () => {
    const created = await createTask('Temporary')
    const id = created.body.data.id
    await agent.delete(`/api/v1/tasks/${id}`).set('idempotency-key', key()).expect(200)
    await agent.get(`/api/v1/tasks/${id}`).expect(404)
  })

  it('returns 400 for a malformed id and for an empty update', async () => {
    expect((await agent.get('/api/v1/tasks/not-an-id')).status).toBe(400)
    const created = await createTask('Untouched')
    const empty = await agent
      .patch(`/api/v1/tasks/${created.body.data.id}`)
      .set('idempotency-key', key())
      .send({})
    expect(empty.status).toBe(400)
  })

  it('echoes the caller request id in the header and in meta', async () => {
    const res = await agent.get('/api/v1/tasks').set('x-request-id', 'trace-me-12345')
    expect(res.headers['x-request-id']).toBe('trace-me-12345')
    expect(res.body.meta.requestId).toBe('trace-me-12345')
  })
})
