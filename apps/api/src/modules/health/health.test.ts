import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, type TestContext } from '../../test/harness.js'

let ctx: TestContext
beforeAll(async () => {
  ctx = await bootApp()
})
afterAll(() => ctx.close())

describe('health & readiness', () => {
  it('reports liveness on /health', async () => {
    const res = await request(ctx.app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ status: 'ok' })
  })

  it('reports ready when the database answers', async () => {
    expect((await request(ctx.app).get('/ready')).status).toBe(200)
  })

  it('reports not ready (503) once shutdown has started', async () => {
    ctx.lifecycle.shuttingDown = true
    const res = await request(ctx.app).get('/ready')
    ctx.lifecycle.shuttingDown = false
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('UNAVAILABLE')
  })

  it('answers unknown routes with a 404 in the standard envelope', async () => {
    const res = await request(ctx.app).get('/api/v1/nope')
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ data: null, error: { code: 'ROUTE_NOT_FOUND' } })
    expect(res.body.meta.requestId).toBeTypeOf('string')
  })

  it('sets security headers on every response', async () => {
    const res = await request(ctx.app).get('/health')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('answers a malformed JSON body with 400 instead of crashing', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('content-type', 'application/json')
      .send('{"email": ')
    expect(res.status).toBe(400)
    expect(ctx.programmerErrors).toHaveLength(0)
  })
})
