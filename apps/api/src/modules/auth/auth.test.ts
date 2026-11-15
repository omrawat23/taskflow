import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bootApp, key, signedInAgent, type TestContext } from '../../test/harness.js'

let ctx: TestContext
beforeAll(async () => {
  ctx = await bootApp()
})
afterAll(() => ctx.close())

const cookieNames = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split('=')[0])

describe('POST /api/v1/auth/register', () => {
  it('creates an account and returns the public profile without any password data', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .set('idempotency-key', key())
      .send({ email: 'Ada@Example.com', name: 'Ada', password: 'analytical-engine' })

    expect(res.status).toBe(201)
    expect(res.body.error).toBeNull()
    expect(res.body.data).toMatchObject({ email: 'ada@example.com', name: 'Ada' })
    expect(JSON.stringify(res.body)).not.toMatch(/password/i)
  })

  it('stores the password as an argon2id hash and enqueues user.registered in the outbox', async () => {
    const user = await ctx.database.db.collection('users').findOne({ email: 'ada@example.com' })
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/)
    const events = await ctx.database.db
      .collection('outbox')
      .find({ type: 'user.registered' })
      .toArray()
    expect(events).toHaveLength(1)
  })

  it('returns 409 EMAIL_TAKEN when the email is already registered', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .set('idempotency-key', key())
      .send({ email: 'ada@example.com', name: 'Ada again', password: 'analytical-engine' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_TAKEN')
  })

  it('returns 400 with field errors when the body is invalid', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .set('idempotency-key', key())
      .send({ email: 'not-an-email', name: '', password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    expect(Object.keys(res.body.error.details.body)).toEqual(
      expect.arrayContaining(['email', 'name', 'password']),
    )
  })

  it('returns 400 when the Idempotency-Key header is missing', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/register')
      .send({ email: 'grace@example.com', name: 'Grace', password: 'compiler-first' })
    expect(res.status).toBe(400)
    expect(res.body.error.details.headers['idempotency-key']).toBeDefined()
  })
})

describe('session lifecycle', () => {
  it('signs in with httpOnly cookies and returns the user from /me', async () => {
    const { agent, email } = await signedInAgent(ctx.app)
    const me = await agent.get('/api/v1/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.data.email).toBe(email)
  })

  it('marks both session cookies httpOnly and SameSite=Strict', async () => {
    const { email, password } = await signedInAgent(ctx.app)
    const res = await request(ctx.app).post('/api/v1/auth/login').send({ email, password })
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(cookies).toHaveLength(2)
    for (const cookie of cookies) {
      expect(cookie).toMatch(/HttpOnly/)
      expect(cookie).toMatch(/SameSite=Strict/)
    }
  })

  it('returns the same 401 message for a wrong password and an unknown email', async () => {
    const { email } = await signedInAgent(ctx.app)
    const wrongPassword = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'nope-nope' })
    const unknownEmail = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'nope-nope' })
    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message)
  })

  it('rotates the refresh token, and revokes the whole session when an old token is reused', async () => {
    const { email, password } = await signedInAgent(ctx.app)
    const login = await request(ctx.app).post('/api/v1/auth/login').send({ email, password })
    const oldRefresh = ([] as string[])
      .concat(login.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('tf_rt='))
      ?.split(';')[0]
    expect(oldRefresh).toBeDefined()

    const rotated = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldRefresh ?? '')
    expect(rotated.status).toBe(200)
    expect(cookieNames(rotated)).toEqual(expect.arrayContaining(['tf_at', 'tf_rt']))
    const newRefresh = ([] as string[])
      .concat(rotated.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('tf_rt='))
      ?.split(';')[0]

    const reuse = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldRefresh ?? '')
    expect(reuse.status).toBe(401)

    // Reuse detection revoked the family, so the newest token is dead too.
    const afterReuse = await request(ctx.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', newRefresh ?? '')
    expect(afterReuse.status).toBe(401)
  })

  it('throttles repeated login attempts from one IP with 429 RATE_LIMITED', async () => {
    const limited = await bootApp({ AUTH_RATE_LIMIT: '2' })
    try {
      const attempt = () =>
        request(limited.app)
          .post('/api/v1/auth/login')
          .send({ email: 'x@example.com', password: 'whatever1' })
      expect((await attempt()).status).toBe(401)
      expect((await attempt()).status).toBe(401)
      const third = await attempt()
      expect(third.status).toBe(429)
      expect(third.body.error.code).toBe('RATE_LIMITED')
    } finally {
      await limited.close()
    }
  })

  it('logs out and rejects /me afterwards', async () => {
    const { agent } = await signedInAgent(ctx.app)
    await agent.post('/api/v1/auth/logout').expect(200)
    const me = await agent.get('/api/v1/auth/me')
    expect(me.status).toBe(401)
    expect(me.body.error.code).toBe('UNAUTHORIZED')
  })
})
