import { HttpResponse, http } from 'msw'
import { TaskStatus } from '@/common/lib/schemas'
import { db, nextId } from './db'

// Network-boundary mocks that mirror the real API contract ({ data, error, meta }).
const meta = (extra: Record<string, unknown> = {}) => ({ requestId: 'test-request', ...extra })
const ok = (data: unknown, status = 200, extra: Record<string, unknown> = {}) =>
  HttpResponse.json({ data, error: null, meta: meta(extra) }, { status })
export const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ data: null, error: { code, message }, meta: meta() }, { status })

const publicUser = (id: string) => {
  const user = db.users.find((u) => u.id === id)
  if (!user) return null
  const { password: _password, ...rest } = user
  return rest
}

const requireSession = () => (db.sessionUserId ? db.sessionUserId : null)

export const handlers = [
  http.get('/api/v1/auth/me', () => {
    const userId = requireSession()
    return userId ? ok(publicUser(userId)) : fail(401, 'UNAUTHORIZED', 'Authentication required')
  }),

  http.post('/api/v1/auth/login', async ({ request }) => {
    const { email, password } = (await request.json()) as { email: string; password: string }
    const user = db.users.find((u) => u.email === email && u.password === password)
    if (!user) return fail(401, 'UNAUTHORIZED', 'Invalid email or password')
    db.sessionUserId = user.id
    return ok(publicUser(user.id))
  }),

  http.post('/api/v1/auth/register', async ({ request }) => {
    const body = (await request.json()) as { email: string; name: string; password: string }
    if (db.users.some((u) => u.email === body.email)) {
      return fail(409, 'EMAIL_TAKEN', 'An account with this email already exists')
    }
    const user = { id: nextId(), createdAt: new Date().toISOString(), ...body }
    db.users.push(user)
    return ok(publicUser(user.id), 201)
  }),

  http.post('/api/v1/auth/refresh', () => fail(401, 'UNAUTHORIZED', 'Session expired')),

  http.post('/api/v1/auth/logout', () => {
    db.sessionUserId = null
    return ok({ loggedOut: true })
  }),

  http.get('/api/v1/tasks', ({ request }) => {
    const userId = requireSession()
    if (!userId) return fail(401, 'UNAUTHORIZED', 'Authentication required')
    const url = new URL(request.url)
    const status = TaskStatus.optional().parse(url.searchParams.get('status') ?? undefined)
    const cursor = url.searchParams.get('cursor')
    const limit = Number(url.searchParams.get('limit') ?? 20)
    const mine = db.tasks
      .filter((t) => t.ownerId === userId && (!status || t.status === status))
      .sort((a, b) => b.id.localeCompare(a.id)) // newest first, like the _id cursor
      .filter((t) => !cursor || t.id < cursor)
    const page = mine.slice(0, limit)
    const nextCursor = mine.length > limit ? (page.at(-1)?.id ?? null) : null
    return ok(page, 200, { nextCursor })
  }),

  http.post('/api/v1/tasks', async ({ request }) => {
    const userId = requireSession()
    if (!userId) return fail(401, 'UNAUTHORIZED', 'Authentication required')
    const { title, description = '' } = (await request.json()) as {
      title: string
      description?: string
    }
    const now = new Date().toISOString()
    const task = {
      id: nextId(),
      ownerId: userId,
      title,
      description,
      status: 'todo' as const,
      createdAt: now,
      updatedAt: now,
    }
    db.tasks.push(task)
    return ok(task, 201)
  }),

  http.patch('/api/v1/tasks/:id', async ({ params, request }) => {
    const task = db.tasks.find((t) => t.id === params.id && t.ownerId === db.sessionUserId)
    if (!task) return fail(404, 'NOT_FOUND', 'Task not found')
    Object.assign(task, await request.json(), { updatedAt: new Date().toISOString() })
    return ok(task)
  }),

  http.delete('/api/v1/tasks/:id', ({ params }) => {
    const index = db.tasks.findIndex((t) => t.id === params.id && t.ownerId === db.sessionUserId)
    if (index === -1) return fail(404, 'NOT_FOUND', 'Task not found')
    db.tasks.splice(index, 1)
    return ok({ id: params.id })
  }),
]
