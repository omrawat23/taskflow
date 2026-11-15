import { z } from 'zod'
import { env } from './env'
import { ApiErrorBody, Meta } from './schemas'

/** Every response is { data, error, meta }; `data` is validated separately against the endpoint's schema. */
const Envelope = z.object({ data: z.unknown(), error: ApiErrorBody.nullable(), meta: Meta })

// The only place the app touches `fetch`. Responsibilities:
// - parse every response against its Zod contract (API responses are a trust boundary)
// - map the { data, error, meta } envelope to data or a typed ApiError
// - bound every call with a timeout
// - attach an Idempotency-Key to writes so retries are safe
// - refresh the session once on 401 and replay the request

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number | undefined>
  /** Reuse the same key when retrying the same logical write. */
  idempotencyKey?: string
  signal?: AbortSignal
}

export interface ApiResponse<T> {
  data: T
  meta: Record<string, unknown> & { requestId: string }
}

const SESSION_ENDPOINTS = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout']

const buildUrl = (path: string, query?: RequestOptions['query']) => {
  const url = new URL(path, env.VITE_API_URL || window.location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url
}

let refreshing: Promise<boolean> | null = null
/** Concurrent 401s share one refresh call. */
const refreshSession = () => {
  refreshing ??= fetch(buildUrl('/api/v1/auth/refresh'), { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

const send = async <S extends z.ZodType>(
  method: Method,
  path: string,
  schema: S,
  opts: RequestOptions,
  allowRefresh: boolean,
): Promise<ApiResponse<z.output<S>>> => {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  if (method !== 'GET') headers['idempotency-key'] = opts.idempotencyKey ?? crypto.randomUUID()

  const timeout = AbortSignal.timeout(env.VITE_API_TIMEOUT_MS)
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers,
    credentials: 'include',
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
  })

  if (res.status === 401 && allowRefresh && !SESSION_ENDPOINTS.includes(path)) {
    if (await refreshSession()) return send(method, path, schema, opts, false)
  }

  const json: unknown = await res.json().catch(() => null)
  const parsed = Envelope.safeParse(json)
  if (!parsed.success) {
    throw new ApiError(res.status, 'BAD_RESPONSE', 'The server sent an unexpected response')
  }
  const { error, meta } = parsed.data
  if (!res.ok || error) {
    throw new ApiError(
      res.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Request failed',
      error?.details,
      meta.requestId,
    )
  }
  const data = schema.safeParse(parsed.data.data)
  if (!data.success) {
    throw new ApiError(
      res.status,
      'BAD_RESPONSE',
      'The server sent an unexpected response',
      undefined,
      meta.requestId,
    )
  }
  return { data: data.data, meta }
}

export const apiClient = {
  get: <S extends z.ZodType>(path: string, schema: S, opts: Omit<RequestOptions, 'body'> = {}) =>
    send('GET', path, schema, opts, true),
  post: <S extends z.ZodType>(path: string, schema: S, opts: RequestOptions = {}) =>
    send('POST', path, schema, opts, true),
  patch: <S extends z.ZodType>(path: string, schema: S, opts: RequestOptions = {}) =>
    send('PATCH', path, schema, opts, true),
  delete: <S extends z.ZodType>(path: string, schema: S, opts: RequestOptions = {}) =>
    send('DELETE', path, schema, opts, true),
}

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError
