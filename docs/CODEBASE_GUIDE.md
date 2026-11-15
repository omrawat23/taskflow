# Taskflow: Codebase Guide

This guide is for reading, changing and extending this codebase fluently. It explains **what every
folder and file does, how a request travels through the system, and why things are built the way
they are**. Read [`README.md`](../README.md) first for setup and the quick overview.

---

## Table of contents

1. [How to read this repo](#1-how-to-read-this-repo)
2. [The mental model](#2-the-mental-model)
3. [Shared contracts: `packages/contracts`](#3-shared-contracts-packagescontracts)
4. [The API: `apps/api`](#4-the-api-appsapi)
5. [The web app: `apps/web`](#5-the-web-app-appsweb)
6. [End-to-end walkthroughs](#6-end-to-end-walkthroughs)
7. [Data model](#7-data-model)
8. [Security model](#8-security-model)
9. [Observability & operations](#9-observability--operations)
10. [Testing guide](#10-testing-guide)
11. [Recipe: adding a feature](#11-recipe-adding-a-feature)
12. [Playbook compliance map](#12-playbook-compliance-map)
13. [Conventions, gotchas & FAQ](#13-conventions-gotchas--faq)

---

## 1. How to read this repo

Suggested reading order (≈ 1 hour to understand everything):

| # | File | Why |
|---|---|---|
| 1 | `packages/contracts/src/index.ts` | The vocabulary of the whole system: `User`, `Task`, inputs, error shape |
| 2 | `apps/api/src/app.ts` | The middleware pipeline and how modules are mounted |
| 3 | `apps/api/src/modules/tasks/*` | A complete feature: routes → service → repo, plus its test |
| 4 | `apps/api/src/common/http.ts`, `errors.ts`, `error-handler.ts` | How input is validated and how errors become responses |
| 5 | `apps/api/src/common/idempotency.ts`, `outbox.ts` | The two "production" patterns on every write |
| 6 | `apps/api/src/modules/auth/*` | Sessions, cookies, refresh-token rotation |
| 7 | `apps/web/src/app/router.tsx` | Every screen, route guards, lazy loading |
| 8 | `apps/web/src/common/lib/api-client.ts` | The single gateway from the UI to the API |
| 9 | `apps/web/src/pages/tasks/*` | A complete UI feature: hooks, optimistic updates, components |
| 10 | `apps/*/src/**/*.test.ts(x)` | The tests double as executable documentation |

> **Rule of thumb for navigating:** find the feature folder first (`modules/<feature>` on the API,
> `pages/<feature>` on the web), then the layer (`routes` / `service` / `repo`, or `components` /
> `hooks` / `services`). Anything shared is in `common/`. Nothing else exists.

---

## 2. The mental model

### Three packages

```
packages/contracts ──(imported by)──► apps/api   (validates requests, parses DB reads)
                   └─(imported by)──► apps/web   (validates forms, parses API responses)
```

`contracts` is TypeScript source, consumed directly: Vite and tsx compile it, and tsup bundles it into
the API build. Change a schema there and both sides get the new rule and the new type.

### Layers, one direction only

```
API   HTTP request
       │  app.ts middleware: helmet → cors → json → cookies → request-id → pino-http → rate-limit
       ▼
      *.routes.ts      auth guard, rate limit, idempotency, endpoint() validates with Zod
       ▼
      *.service.ts     business rules, transactions, outbox events. Knows nothing about HTTP.
       ▼
      *.repo.ts        MongoDB queries; returns Zod-parsed entities, never raw documents
       ▼
      MongoDB

WEB   Component (JSX only)
       ▼
      Custom hook      TanStack Query / mutations, cache updates, navigation
       ▼
      *.service.ts     one function per endpoint, picks the response schema
       ▼
      api-client.ts    fetch + envelope + Zod + timeout + idempotency key + refresh-on-401
```

**Boundaries are enforced, not just suggested:**
- API: modules import from their own folder, from `common/`, or from another module's public
  `index.ts` (tasks uses only `requireAuth` from auth).
- Web: Oxlint's `no-restricted-imports` rule **fails the build** if anything imports
  `@/pages/<other-feature>/<internal-file>`. Only `@/pages/<feature>` (its `index.ts`) is allowed.

---

## 3. Shared contracts: `packages/contracts`

`src/index.ts` is the only file. Contents:

| Export | Kind | Used by |
|---|---|---|
| `ObjectIdString` | 24-hex string schema | ids everywhere (`/tasks/:id` params, cursors) |
| `User` | `{ id, email, name, createdAt }` | API repo output, `/auth/me`, web session |
| `RegisterInput` | `{ email (lower-cased), name, password ≥ 8 }` | API register route, web register form |
| `LoginInput` | `{ email, password }` | API login route, web login form (error texts like "Password is required" come from here) |
| `TaskStatus` | `'todo' \| 'in_progress' \| 'done'` | everywhere |
| `Task` | `{ id, ownerId, title, description, status, createdAt, updatedAt }` | API repo output, web list |
| `CreateTaskInput` | `{ title (1–200), description (≤2000, default '') }` | API + web new-task form |
| `UpdateTaskInput` | partial `{ title, description, status }`, at least one field | API PATCH |
| `ListTasksQuery` | `{ cursor?, limit 1–50 (default 20), status? }` | API GET /tasks |
| `TaskPage` | `{ items, nextCursor }` | API repo/service |
| `ApiError`, `Meta` | envelope parts | web api-client envelope parsing |

Note the two type flavours: `z.input<…>` (what a form or client sends, e.g. `description` is
optional) and `z.infer<…>`/`z.output<…>` (what you get after parsing, e.g. `description` is always a
string).

---

## 4. The API: `apps/api`

### 4.1 Entry points

| File | Role |
|---|---|
| `src/server.ts` | **Process entry.** Loads config, connects MongoDB (+ Redis if configured), calls `createApp`, listens, sets `requestTimeout`/`headersTimeout`, and owns **graceful shutdown**: SIGTERM → `lifecycle.shuttingDown = true` (so `/ready` returns 503) → `server.close()` + close idle connections → force-close after `SHUTDOWN_TIMEOUT_MS` → close DB → quit Redis → flush logs → exit. Also crashes cleanly on `unhandledRejection` / `uncaughtException`. |
| `src/app.ts` | **`createApp(deps)`**: a pure factory (no side effects, no `listen`), so tests can boot it in-process. Declares the exact middleware order, builds the modules and mounts them: health at `/`, auth at `/api/v1/auth`, tasks at `/api/v1/tasks`. |
| `src/worker.ts` | **Outbox worker process.** Polls `processNextEvent()` in a loop (1 s idle sleep), publishes via the webhook publisher if configured or the log publisher otherwise, and stops cleanly on SIGTERM after the in-flight event. |
| `src/migrations/run.ts` | CLI for `pnpm migrate`: connects, runs `migrate()`, exits. |
| `src/common/otel.ts` | Loaded *before everything* via `node --import`. Starts OpenTelemetry only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. |

### 4.2 `src/common/` (cross-cutting code, file by file)

| File | What it gives you | Key details |
|---|---|---|
| `config.ts` | `loadConfig(env)` → typed `Config` | Zod schema for all env vars; empty strings count as unset; production requires `REDIS_URL`; enforces `OUTBOUND < DB < REQUEST` timeouts; exits with a readable error |
| `logger.ts` | `createLogger(level, pretty)` | pino JSON to stdout; `REDACT_PATHS` hides auth headers, cookies, `Set-Cookie`, passwords and tokens |
| `db.ts` | `connectDatabase()` → `Database { db, withTransaction, ping, close }`; `isDuplicateKey()` | One pool per process (`maxPoolSize = cores × 4`), `timeoutMS` bounds every operation, transactions use snapshot read + majority write |
| `errors.ts` | `AppError` → `DomainError` (4xx) / `SystemError` (5xx), plus `ValidationFailed` 400, `Unauthorized` 401, `Forbidden` 403, `NotFound` 404, `Conflict` 409, `UnprocessableEntity` 422, `UpstreamFail` 502, `ServiceUnavailable` 503 | Throw these anywhere; the error handler maps them. Anything else counts as a bug. |
| `error-handler.ts` | `notFound` (404 for unknown routes), `errorHandler(logger, onProgrammerError)` | Operational errors → envelope with `code`/`message`/`details`; malformed JSON → 400 / 413; anything else → safe 500 + `onProgrammerError` (the server shuts down and restarts) |
| `http.ts` | `send()`, `sendError()`, `endpoint()`, `userId()`; adds `req.user` to Express types | `endpoint({ body, query, params }, handler)` parses each with Zod and passes **typed** input to the handler; failures throw `ValidationFailed` with field errors |
| `request-id.ts` | `requestId` middleware | Accepts a well-formed incoming `x-request-id` or generates a UUID; sets the response header; pino-http reuses it |
| `rate-limit.ts` | `createLimiter({ redis, prefix, windowMs, limit, by, skip })` | `by: 'ip'` or `'user'`; Redis store when available; 429 in the standard envelope |
| `idempotency.ts` | `idempotency(db)` middleware | See [§6.2](#62-create-a-task-ui-click--database--event--webhook). Keys are UUIDs scoped per user, stored in `idempotency_keys` (24 h TTL) |
| `outbox.ts` | `outboxRepo(db)` (`enqueue`, `claimNext`, `markPublished`, `markFailedAttempt`), `processNextEvent()`, `logPublisher`, `webhookPublisher` | Strict ordering: only the oldest pending event is ever claimed; backoff `min(60s, 2^(n-1)s)`; dead letter (`status: 'failed'`) after 10 attempts |
| `resilience.ts` | `retry()`, `backoffDelay()`, `NonRetryableError`, `circuitBreaker()` | Full-jitter exponential backoff; 4xx are never retried and don't trip the breaker |
| `crypto.ts` | `sha256`, `randomToken`, `hmacSha256`, `safeEqual`, `verifyWebhookSignature` | `safeEqual` uses `timingSafeEqual` |
| `password.ts` | `hashPassword`, `verifyPassword`, `dummyPasswordHash` | argon2id (19 MiB, t=2, p=1), async on the libuv pool; the dummy hash equalises login timing |
| `otel.ts` | Telemetry bootstrap | Auto-instrumentation (HTTP, Express, MongoDB, pino), OTLP trace + metric exporters, event-loop-delay p99 gauge |

### 4.3 `src/modules/` (features)

Every module has the same anatomy:

```
modules/<feature>/
  <feature>.routes.ts   HTTP only: guards → endpoint(schema, handler) → service → send()
  <feature>.service.ts  business rules, transactions, outbox events
  <feature>.repo.ts     MongoDB access, document ⇄ entity mapping (Zod-parsed)
  <feature>.schema.ts   re-exports contract schemas + private persistence types (…Doc)
  <feature>.test.ts     integration tests (real app, real DB)
  index.ts              the module's public surface + wiring (create<Feature>Module)
```

#### `modules/auth`

| File | Responsibility |
|---|---|
| `auth.schema.ts` | `UserDoc`, `RefreshTokenDoc` (DB shapes), `RefreshTokenRecord`, `AccessTokenClaims`, cookie names `tf_at` / `tf_rt` |
| `auth.repo.ts` | `usersRepo`: `findById`, `findCredentialsByEmail` (entity + hash), `create`. `refreshTokensRepo`: `create`, `findByHash`, `revoke` (only if still active, returns false if someone beat us), `revokeFamily` |
| `auth.tokens.ts` | `createAccessTokens(secret, ttl)` → `sign(userId)` / `verify(token)` using jose HS256 with issuer/audience checks; expired → "Session expired" 401 |
| `auth.service.ts` | `register` (hash → transaction: create user + `user.registered` event; duplicate email → 409), `login` (constant-time; new session family), `refresh` (rotation + reuse detection), `logout` (revokes the family), `me` |
| `auth.middleware.ts` | `createRequireAuth(tokens)` reads the `tf_at` cookie, verifies it, sets `req.user = { id }` |
| `auth.routes.ts` | `/register` (rate-limited + idempotent), `/login`, `/refresh`, `/logout`, `/me`. Cookie options live here, since cookies are an HTTP concern. |
| `index.ts` | `createAuthModule({ database, config, redis })` → `{ router, requireAuth }` |

#### `modules/tasks`

| File | Responsibility |
|---|---|
| `tasks.schema.ts` | `TaskDoc`, `TaskIdParams`, contract re-exports |
| `tasks.repo.ts` | `list` (cursor pagination: `_id < cursor`, sort `_id` desc, fetch `limit + 1` to know whether there's a next page), `findById`, `create`, `update` (`findOneAndUpdate`, returns the new doc), `delete`. **Every query filters by `ownerId`.** |
| `tasks.service.ts` | `list`, `get` (404 if missing), and `create` / `update` / `remove`, each inside `withTransaction` together with its outbox event |
| `tasks.routes.ts` | `router.use(requireAuth, userLimiter, idempotency)` then GET `/`, POST `/`, GET/PATCH/DELETE `/:id` |
| `index.ts` | `createTasksModule({ database, redis, requireAuth })` |

#### `modules/health`

`/health` always returns 200 (liveness). `/ready` returns 503 while shutting down or if
`database.ping()` fails (readiness). Both skip the global rate limit.

### 4.4 `src/migrations/`

`index.ts` holds an ordered list of `{ id, up(db) }`. `migrate()` runs each one not yet recorded in
`_migrations`, then records it. Each step is idempotent (creates the collection if missing, then
indexes). **Never edit an applied migration; append a new one.**

### 4.5 Tests & scripts

| File | Role |
|---|---|
| `src/test/global-setup.ts` | Starts **one** MongoDB replica set for the whole test run and `provide`s its URI |
| `src/test/harness.ts` | `bootApp(overrides)` creates a fresh database (`test_<uuid>`), runs migrations, builds the app with a silent logger and records programmer errors. `signedInAgent(app)` registers and logs in a user, returning a cookie-carrying supertest agent. `key()` returns a new idempotency key. |
| `scripts/dev-db.ts` | Local replica set on `:27017` with persistent data in `apps/api/.devdb` (no Docker) |
| `scripts/e2e-server.ts` | Throwaway replica set + migrated API on `:4000` for Playwright |
| `tsup.config.ts` | Bundles `server`, `worker`, `otel`, `migrations/run` to ESM; dependencies stay external (so OTel can patch them) |
| `Dockerfile` | Multi-stage, `pnpm deploy --prod`, runs as `USER node` with OTel preloaded |

---

## 5. The web app: `apps/web`

### 5.1 Boot sequence

```
index.html → src/main.tsx
               ├─ createQueryClient()              (app/query-client.ts)
               ├─ createAppRouter(queryClient)     (app/router.tsx)
               └─ <App>                            (app/App.tsx)
                    └─ QueryClientProvider → RouterProvider → AppShell → <Outlet/> (the page)
```

### 5.2 `src/app/` (routing, providers, shell)

| File | Role |
|---|---|
| `query-client.ts` | Defaults: `staleTime` 60 s, refetch on focus, never retry 4xx, mutations don't retry unless a hook opts in |
| `router.tsx` | Code-based TanStack Router. Routes: `/` → redirect to `/tasks`; `/login` (search `redirect`, validated to be an in-app path, which blocks open redirects); `/register`; `/tasks` (search `status`, validated with `TaskStatus`). **Guards** run in `beforeLoad` using `queryClient.ensureQueryData(currentUserQuery)`: signed-out users hitting `/tasks` go to `/login?redirect=…`, and signed-in users hitting `/login` go to `/tasks`. The tasks page is **lazy-loaded** (`React.lazy(loadTasksPage)`) into its own JS chunk. |
| `App.tsx` | The provider tree, shared by `main.tsx` and tests |
| `AppShell.tsx` | Header (app name, user name, Log out) + `<Outlet/>`; `NotFound` page |

### 5.3 `src/pages/` (features)

Each page module: `components/` (UI), `hooks/` (state & data), `services/` (API calls), a
`*Page.tsx`, tests, and an `index.ts` public surface.

#### `pages/auth`

| File | Role |
|---|---|
| `services/auth.service.ts` | `me()` (returns `null` on 401 rather than throwing), `login`, `register(input, idempotencyKey)`, `logout` |
| `hooks/useSession.ts` | `currentUserQuery` (key `['auth','me']`, 5 min stale, no retry), `useCurrentUser`, `useLogin(redirectTo)` (writes the user into the cache, then navigates), `useRegister` (register → auto-login; one idempotency key per submit, retries only network errors), `useLogout` (clears the whole cache, then navigates to `/login`) |
| `components/LoginForm.tsx`, `RegisterForm.tsx` | React Hook Form + `zodResolver(contract schema)`; show server errors via `ErrorAlert` |
| `LoginPage.tsx`, `RegisterPage.tsx` | Card layout + link to the other page |
| `index.ts` | Exports `currentUserQuery`, `useCurrentUser`, `useLogout`, `LoginPage`, `RegisterPage` |

#### `pages/tasks`

| File | Role |
|---|---|
| `services/tasks.service.ts` | `list({ cursor, status, signal })` → `{ items, nextCursor }` (reads `meta.nextCursor`); `create`, `update`, `remove`, each taking an idempotency key |
| `hooks/useTasks.ts` | `taskKeys` (`['tasks']`, `['tasks','list',{status}]`); `useTasks(status)` (infinite query over cursors); `useCreateTask` (invalidates lists on success); `useUpdateTaskStatus` and `useDeleteTask` (**optimistic**: cancel in-flight list queries → snapshot → patch the cache → roll back on error → refetch on settle) |
| `hooks/task-cache.ts` | Pure functions `patchTaskInPages`, `removeTaskFromPages` used by the optimistic updates |
| `components/TaskList.tsx` | Owns the list query and the two mutations; guards (loading → error → empty) then renders items and "Load more" |
| `components/TaskItem.tsx` | Presentational row: title, description, a status `<select>`, delete button |
| `components/DeleteTaskButton.tsx` | Owns its own `open` state and renders the confirmation `Dialog` |
| `components/NewTaskForm.tsx` | RHF + `CreateTaskInput`; resets after success |
| `components/StatusFilter.tsx` | `<Link to="/tasks" search={{ status }}>` buttons; the URL is the filter state |
| `components/status-labels.ts` | `todo → "To do"` etc. |
| `TasksPage.tsx` | Composes the two cards (new task, list + filter); default export for lazy loading |
| `index.ts` | Exports `taskKeys`, `loadTasksPage` |

### 5.4 `src/common/` (shared building blocks)

| File | Role |
|---|---|
| `lib/api-client.ts` | **The only `fetch` in the app.** Builds the URL (`VITE_API_URL` or same origin), sends cookies (`credentials: 'include'`), adds `Idempotency-Key` to non-GET requests (caller-supplied or random), applies `AbortSignal.timeout`, on 401 calls `/auth/refresh` once (concurrent 401s share one refresh) and replays, parses the envelope, throws a typed `ApiError(status, code, message, details, requestId)`, then validates `data` with the endpoint's Zod schema |
| `lib/schemas.ts` | Adapter re-exporting the contract schemas (swap the source in one place) |
| `lib/env.ts` | Zod-validated `import.meta.env` |
| `lib/utils.ts` | `cn()` (clsx + tailwind-merge), `errorMessage()` |
| `components/ui/button.tsx` | `cva` variants (default/outline/ghost/destructive × default/sm/icon) |
| `components/ui/input.tsx` | `Input`, `Textarea`, `Label` (requires `htmlFor`) |
| `components/ui/field.tsx` | Label + control + error; wires `id`, `aria-invalid` and `aria-describedby` automatically |
| `components/ui/card.tsx` | Compound `Card` / `Card.Header` / `Card.Title` / `Card.Body` |
| `components/ui/dialog.tsx` | Compound `Dialog` / `.Header` / `.Body` / `.Footer` on native `<dialog>` (focus trap, Esc, top layer) |
| `components/ui/feedback.tsx` | `Spinner` (`<output>`), `ErrorAlert` (`role="alert"`) |
| `*.stories.tsx` | Storybook stories for Button, Field, Dialog |

### 5.5 Styling

Tailwind v4 via `@tailwindcss/vite`. Design tokens (colors) are defined once in `src/index.css`
under `@theme`, with a dark-mode override. Components use token classes (`bg-primary`,
`text-muted-foreground`), never raw colors.

---

## 6. End-to-end walkthroughs

### 6.1 Signing in

```
LoginForm submit
 └─ RHF validates with LoginInput (empty password → "Password is required", no request sent)
 └─ useLogin.mutate(values)
     └─ authService.login → apiClient.post('/api/v1/auth/login', User, { body })
         └─ Vite proxy → API
             helmet → cors → json → cookies → request-id → pino-http → global limiter
             auth.routes /login: authLimiter → endpoint({ body: LoginInput })
             auth.service.login:
               usersRepo.findCredentialsByEmail(email)
               ├─ not found → verify against dummy hash (same timing) → 401
               ├─ wrong password → 401 "Invalid email or password"
               └─ ok → refresh token = random 32 bytes, store sha256(token) with a new familyId
                       access token = JWT(sub=userId, 15 min)
             routes: Set-Cookie tf_at (path /api) + tf_rt (path /api/v1/auth), both HttpOnly, SameSite=Strict
             send(User) → { data: user, error: null, meta: { requestId } }
     └─ api-client: envelope ok → User.parse(data)
 └─ onSuccess: cache['auth','me'] = user → navigate({ href: redirectTo })
 └─ router beforeLoad on /tasks: ensureQueryData(me) hits the cache → allowed
```

### 6.2 Create a task (UI click → database → event → webhook)

```
NewTaskForm submit → useCreateTask.mutate({ input, key: crypto.randomUUID() })
 └─ apiClient.post('/api/v1/tasks', Task, { body, idempotencyKey: key })
     headers: Idempotency-Key: <key>, Cookie: tf_at=…
 API:
   tasks router: requireAuth (verify JWT → req.user) → userLimiter (by user id)
   idempotency middleware:
     insert { _id: "<userId>:<key>", requestHash, state: in_progress }
       ├─ duplicate & same hash & completed → replay stored status+body, header idempotent-replayed: true
       ├─ duplicate & different body        → 422 IDEMPOTENCY_KEY_REUSED
       └─ duplicate & still in progress     → 409 IDEMPOTENCY_IN_PROGRESS
     wraps res.json so the final response is saved BEFORE it is sent (5xx → key deleted, retry allowed)
   endpoint({ body: CreateTaskInput }) → tasks.service.create(userId, body)
     database.withTransaction(session):
       tasksRepo.create(…, session)                              → tasks collection
       outbox.enqueue({ type: 'task.created', payload }, session) → outbox collection
     (both commit or neither does)
   send(task, { status: 201 })
 └─ onSuccess: invalidateQueries(['tasks']) → the list refetches → the new task appears

Later, in the worker process:
 processNextEvent → claimNext (oldest pending only, 30 s lock, attempts+1)
   → webhookPublisher.publish: POST with x-signature HMAC, 5 s timeout,
       retry ×3 with jitter (4xx never retried), wrapped in a circuit breaker
   → markPublished, or markFailedAttempt (backoff; dead letter after 10)
```

If the network drops after the server committed, the hook retries with the **same key**: the
server replays the stored 201 and no duplicate task is created.

### 6.3 Session refresh & reuse detection

```
access token expires (15 min) → any API call returns 401
 └─ api-client: POST /auth/refresh once (shared across concurrent 401s), then replays the request
 API refresh:
   find sha256(tf_rt) ─ missing/expired → 401 (cookies cleared)
                       ─ already revoked → someone replayed an old token → revoke the WHOLE family → 401
                       ─ ok → atomically revoke it (if another request won the race → treat as reuse)
                              → issue a new access + refresh token in the same family
```

### 6.4 Optimistic status change with rollback

```
TaskItem <select> change → TaskList → useUpdateTaskStatus.mutate({ id, status, key })
 onMutate:  cancelQueries(['tasks']) → snapshot every cached list → patchTaskInPages(...)  (UI updates instantly)
 request:   PATCH /api/v1/tasks/:id
 onError:   restore every snapshot → ErrorAlert shows the server message
 onSettled: invalidateQueries(['tasks']) → the server truth is re-fetched
```

### 6.5 What happens on an error

| Situation | Who handles it | Client sees |
|---|---|---|
| Body fails Zod | `endpoint()` throws `ValidationFailed` | 400 `VALIDATION_FAILED` with `details.body.<field>` |
| Malformed JSON | body-parser error → `errorHandler` | 400 `BAD_REQUEST` |
| Unknown route | `notFound` | 404 `ROUTE_NOT_FOUND` |
| Missing/other user's task | service throws `NotFound` | 404 `NOT_FOUND` |
| Too many requests | limiter | 429 `RATE_LIMITED` |
| A bug (non-AppError) | `errorHandler` logs `fatal`, sends a safe 500, then the server shuts down gracefully and the supervisor restarts it | 500 `INTERNAL` |
| Any error | — | always includes `meta.requestId`; search the logs for it |

---

## 7. Data model

All collections are created and indexed by migrations.

| Collection | Document | Indexes | Notes |
|---|---|---|---|
| `users` | `_id, email, name, passwordHash, createdAt` | `email` unique | email is stored lower-case |
| `tasks` | `_id, ownerId, title, description, status, createdAt, updatedAt` | `{ownerId, _id:-1}`, `{ownerId, status, _id:-1}` | `_id` (ObjectId) is time-ordered, so it doubles as the pagination cursor |
| `refresh_tokens` | `_id, userId, familyId, tokenHash, expiresAt, revokedAt` | `tokenHash` unique, `familyId`, TTL on `expiresAt` | only hashes are stored; a family = one login session |
| `idempotency_keys` | `_id ("<scope>:<uuid>"), requestHash, state, response, expiresAt` | TTL on `expiresAt` (24 h) | `response` = `{ status, body }` |
| `outbox` | `_id, type, payload, status, attempts, availableAt, lockedUntil, lastError, createdAt, publishedAt` | `{status, _id}` | status: `pending` → `published` \| `failed` |
| `_migrations` | `_id (migration id), appliedAt` | — | bookkeeping |

---

## 8. Security model

| Threat | Mitigation | Where |
|---|---|---|
| Stolen passwords from a DB leak | argon2id hashes | `common/password.ts` |
| XSS stealing tokens | Tokens only in `HttpOnly` cookies; JS never sees them | `auth.routes.ts` |
| CSRF | `SameSite=Strict` cookies + JSON-only API + CORS allow-list | `auth.routes.ts`, `app.ts` |
| Refresh-token theft | Rotation on every refresh; reusing an old token revokes the family | `auth.service.ts` |
| User enumeration | Same message + same argon2 cost for unknown email and wrong password | `auth.service.ts` |
| Brute force | `AUTH_RATE_LIMIT` per IP (auth), 120/min per user (tasks), 600/15 min per IP (global) | `rate-limit.ts`, modules' `index.ts` |
| IDOR (reading others' tasks) | Every query includes `ownerId`; the response is 404, not 403 | `tasks.repo.ts` |
| Injection / bad input | Zod on every input; driver queries built from typed values only | `http.ts`, repos |
| Duplicate writes on retry | Idempotency keys | `idempotency.ts` |
| Open redirect after login | `redirect` must match `^/(?!/)` | `app/router.tsx` |
| Secrets in logs | pino redaction | `logger.ts` |
| Forged webhooks | HMAC-SHA256 signature + constant-time verify | `crypto.ts`, `outbox.ts` |
| Clickjacking, MIME sniffing, etc. | helmet (CSP, HSTS, X-Frame-Options, …) | `app.ts` |
| Container escape impact | Runs as non-root `node` | `Dockerfile` |
| Vulnerable deps | `pnpm audit` in CI + Renovate | CI, `renovate.json` |

---

## 9. Observability & operations

- **Logs**: JSON lines on stdout. Every request line carries `reqId`, which is also returned as the
  `x-request-id` header and `meta.requestId`. To investigate a user report, ask for the request id
  and `grep` for it.
- **Pretty logs in dev**: `NODE_ENV=development` pipes through `pino-pretty`.
- **Traces & metrics**: set `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g. a local OpenTelemetry Collector,
  Grafana Tempo, Honeycomb). You get spans for every HTTP request, MongoDB command and outbound
  fetch, plus `http.server.request.duration` and `nodejs.eventloop.delay.p99`.
- **Probes**: liveness `GET /health`, readiness `GET /ready`.
- **Deploy order**: migrate → API → worker. Stopping sends SIGTERM; the API drains for up to
  `SHUTDOWN_TIMEOUT_MS`.
- **Outbox health**: watch for documents with `status: 'failed'` (dead letters). Their `lastError`
  says why.

---

## 10. Testing guide

### Running

```bash
pnpm test                                  # everything (API then web)
pnpm --filter @taskflow/api test           # API only (~3 s after first run)
pnpm --filter @taskflow/web test           # web only
pnpm --filter @taskflow/api exec vitest    # watch mode
pnpm --filter @taskflow/web e2e            # Playwright (needs ~2 GB free RAM)
```

### Writing an API test

```ts
let ctx: TestContext
beforeAll(async () => { ctx = await bootApp() })       // fresh DB, migrated, real app
afterAll(() => ctx.close())

it('returns 404 when the task belongs to someone else', async () => {
  const { agent } = await signedInAgent(ctx.app)       // logged-in supertest agent
  const res = await agent.get('/api/v1/tasks/<id>')
  expect(res.status).toBe(404)
})
```
Writes need `.set('idempotency-key', key())`. Assert on the HTTP response, or query
`ctx.database.db` directly to check stored state (e.g. that an outbox event exists).

### Writing a web test

```tsx
beforeEach(() => signIn(seedUser()))                   // MSW in-memory backend state
test('marks a task as done', async () => {
  seedTask(ownerId, 'Ship release')
  const { user } = renderApp('/tasks')                 // real router + providers
  await user.selectOptions(await screen.findByLabelText(/status of ship release/i), 'done')
  await waitFor(() => expect(db.tasks[0]?.status).toBe('done'))
})
```
To simulate a server failure for one test, call
`server.use(http.patch('/api/v1/tasks/:id', () => fail(500, 'INTERNAL', '…')))`.
Query by role or label, like a user would; never by class names or implementation details.

**Naming**: describe behaviour ("returns 404 when…", "shows error when…"), not calls ("calls repo once").

---

## 11. Recipe: adding a feature

Example: **add an optional `dueDate` to tasks.**

1. **Contract**: in `packages/contracts/src/index.ts`, add `dueDate: z.iso.datetime().nullable()`
   to `Task`, and an optional `dueDate` to `CreateTaskInput` / `UpdateTaskInput`.
2. **Persistence**: add `dueDate: Date | null` to `TaskDoc` (`tasks.schema.ts`), and map it in
   `toTask` and `create` / `update` (`tasks.repo.ts`).
3. **Migration**: if you'll query by it, append `{ id: '006-tasks-due-date', up: … createIndex … }`
   to `migrations/index.ts`. Never edit existing entries.
4. **Service**: no change unless there's a rule (e.g. "a due date can't be in the past" → throw a
   `DomainError`).
5. **API test**: add a case to `tasks.test.ts` ("stores and returns the due date").
6. **Web service/hook**: nothing to change; the types flow from the contract. Update the MSW
   handler/seed if the tests need it.
7. **UI**: add a `Field` + `Input type="date"` to `NewTaskForm`, and show it in `TaskItem` (keep it
   ≤ 5 props, ≤ 150 lines).
8. **Web test**: add a journey in `tasks.test.tsx`.
9. Run `pnpm format && pnpm lint && pnpm typecheck && pnpm test`.

**A brand-new feature** (e.g. projects) follows the same anatomy: create `modules/projects/`
(routes, service, repo, schema, test, index), mount it in `app.ts` under `/api/v1/projects`, add
`pages/projects/` (components, hooks, services, tests, index), and add a route in `app/router.tsx`.
Import other features **only** through their `index.ts`.

---

## 12. Playbook compliance map

### Node.js playbook

| Rule | Implementation |
|---|---|
| 01 Module by domain | `modules/{auth,tasks,health}` each own routes/service/repo/schema/test/index; `common/` holds only cross-cutting code |
| 02 Repository at the data edge | Repos return Zod-parsed entities; services never see documents |
| 03 Validate at every trust boundary | Body/query/params (`endpoint`), env (`config`), headers (idempotency key, request id), cookies, DB reads, outbox events |
| 04 Idempotency on every write | `common/idempotency.ts` on register + all task writes (see the deviations section of the README for session endpoints) |
| 05 Don't block the event loop | Async argon2 on the thread pool, no sync I/O, 100 kB body limit, loop-delay metric |
| 06 Structured logs + correlation IDs | pino + redaction, request id end to end |
| 07 Outbox before two-phase commit | Same-transaction outbox + ordered worker |
| 08 Trace every hop | One OTel SDK via `--import`, OTLP exporters |
| 09 Retry with backoff + circuit breaker | `common/resilience.ts` (never retries 4xx), opossum breaker |
| 10 Automate every quality gate | Biome, Husky + lint-staged, CI `format → lint → type → test → audit`, Renovate |
| Middleware order | helmet → cors → body-parser → request-id → pino-http → rate-limit → auth → validate → routes → 404 → error-handler |
| REST patterns | `/api/v1`, `{data,error,meta}`, cursor pagination, `/health` vs `/ready` |
| Error taxonomy | `AppError` / `DomainError` / `SystemError`; programmer errors → safe 500 + clean restart |
| Graceful shutdown | stop accepting → drain with timeout → close DB → flush logs → exit |
| Security non-negotiables | Zod, typed queries, argon2id, httpOnly cookies + refresh rotation, helmet + rate limit, `timingSafeEqual`, non-root Docker, audit in CI |
| Performance | bounded timeouts (outbound < DB < inbound), one process per container, pool sizing |
| Tests | Integration-heavy against a real DB; unit only for pure logic; behaviour-named |

### React playbook

| Rule | Implementation |
|---|---|
| 01 Co-locate by domain | `pages/{auth,tasks}` + `common/` + `app/`; the lint rule blocks cross-feature internal imports |
| 02 State has owners | Dialog state in its button, form state in forms, the filter in the URL |
| 03 Server state ≠ client state | TanStack Query (server), router search params (URL), RHF + Zod (forms), `useState` (local). No global store needed. |
| 04 Composition before memoization | Compound `Card`/`Dialog`; zero `useMemo`/`memo` |
| 05 ≤ 5 props, ≤ 150 lines, one job | All components; presentational `TaskItem` vs stateful `TaskList` |
| 06 Custom hooks are the unit of reuse | `useTasks`, `useUpdateTaskStatus`, `useLogin`, … |
| 07 Wrap third-party libs | `api-client.ts`, `schemas.ts`, owned shadcn-style UI |
| 08 Test what users do | RTL + MSW journeys, Playwright E2E, unit tests only for pure transforms |
| 09 Measure before optimizing | Route-level code splitting only; no speculative memoization |
| 10 Automate quality | Oxfmt, Oxlint, strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Husky, CI |
| API layering | component → hook → service → api client |
| Caching moves | stale-while-revalidate, optimistic updates with rollback, targeted invalidation |
| Styling & workshop | Tailwind v4 tokens + shadcn/ui-style components; Storybook with a11y checks |

---

## 13. Conventions, gotchas & FAQ

**Conventions**
- API files: `<feature>.<layer>.ts`. Web components: `PascalCase.tsx`; hooks: `useX.ts`.
- API imports use the `.js` extension (ESM + NodeNext); the web uses the `@/` alias for `src/`.
- Never `console.log`; it's a lint error. Use `req.log` (inside requests) or the injected `logger`.
- Throw typed errors from `common/errors.ts`; never `res.status(...).json(...)` an error by hand
  inside a service.
- Every new write endpoint goes behind `idempotency(...)`, and every new web mutation passes one
  `crypto.randomUUID()` per user action.

**Gotchas**
- **MongoDB must be a replica set.** Transactions (and therefore every write) fail on a standalone
  `mongod`. Use `dev:db` or the compose file, and include `?replicaSet=rs0` in `MONGO_URI`.
- `AUTH_RATE_LIMIT` defaults to 20 per 15 min per IP. If you get 429s while developing, raise it in
  `.env`.
- Changing `JWT_ACCESS_SECRET` invalidates all access tokens (users get silently refreshed, or
  must sign in again).
- `pnpm test` runs workspaces one at a time on purpose: the API suite starts a real `mongod`.
- In the browser, cookies only flow because Vite proxies `/api` (same origin). If you serve the web
  app from a different origin, set `VITE_API_URL`, add that origin to `CORS_ORIGIN`, and serve over
  HTTPS.

**FAQ**
- *Where do I see emitted events locally?* Run `pnpm --filter @taskflow/api dev:worker`. Without a
  webhook URL it logs `event published` for each one.
- *Why do other users' tasks return 404 instead of 403?* So the API never confirms that someone
  else's id exists.
- *Why does register not log me in on the server?* So the idempotent register response never has
  to store session cookies. The web app calls login right after register.
- *Why no Redux/Zustand?* There is no shared client state that needs it. Server data lives in the
  Query cache and the filter in the URL (React playbook rule 03).
