# Taskflow

**Taskflow is a small full-stack task manager built on the MERN stack.** You create an account, sign
in, and manage a personal list of tasks: add them, move them through *To do → In progress → Done*,
filter by status, and delete them.

The features are deliberately simple. The value of this repository is **how it is built**. Every
part follows two production architecture playbooks (the *Production-Grade Node.js Architecture
Playbook* and the *Production-Grade React Architecture Playbook* by Petar Ivanov), so you can use it
as a reference for structuring a real MERN codebase:

- feature-based modules on both backend and frontend
- one shared, validated contract between API and UI
- secure cookie sessions with rotating refresh tokens
- safe retries (idempotency keys) on every resource write
- a transactional outbox for events
- structured logs with request IDs, OpenTelemetry, graceful shutdown
- integration tests against a real MongoDB, user-journey UI tests, E2E, and CI quality gates

> 📘 **New to the codebase?** Read [`docs/CODEBASE_GUIDE.md`](docs/CODEBASE_GUIDE.md). It walks
> through every folder and file, traces real requests end to end, and explains how to add a feature.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [Repository layout](#repository-layout)
5. [Getting started](#getting-started)
6. [Scripts](#scripts)
7. [Configuration](#configuration)
8. [API reference](#api-reference)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Design decisions & deviations](#design-decisions--deviations)

---

## Features

| Area | What you can do | What happens under the hood |
|---|---|---|
| **Accounts** | Register, sign in, stay signed in across reloads, sign out | Passwords hashed with argon2id; 15-min access JWT + 7-day refresh token, both in `HttpOnly; SameSite=Strict` cookies; refresh tokens rotate, and reusing an old one revokes the whole session |
| **Tasks** | Create (title + optional description), change status, delete with confirmation | Every write is idempotent (safe to retry) and emits an event via the transactional outbox |
| **List & filter** | Newest first, "Load more", filter by status | Cursor pagination on the API; the filter lives in the URL (`/tasks?status=done`) so it is shareable |
| **Snappy UI** | Status changes and deletes feel instant | Optimistic updates that roll back automatically if the server rejects them |
| **Safety** | Brute-force protection, no data leaks between users | Rate limits per IP and per user; every query is scoped to the owner (other users' tasks look like 404) |

---

## Tech stack

| Layer | Tools |
|---|---|
| Runtime / language | Node.js 24 LTS, TypeScript 5.9 (strict), pnpm 10 workspaces |
| **M**ongoDB | MongoDB 8 (replica set, needed for transactions), official `mongodb` driver |
| **E**xpress | Express 5, Zod 4, helmet, cors, express-rate-limit (+ Redis store), pino / pino-http, jose (JWT), @node-rs/argon2, opossum, OpenTelemetry |
| **R**eact | React 19, Vite 8, TanStack Query, TanStack Router, React Hook Form + Zod, Tailwind CSS v4, shadcn/ui-style components, lucide-react |
| **N**ode tooling | tsx (dev), tsup (build), Biome (API lint/format), Oxlint + Oxfmt (web lint/format) |
| Testing | Vitest, supertest, mongodb-memory-server (real `mongod`), React Testing Library, MSW, Playwright, Storybook |
| Delivery | Docker (non-root), docker-compose, GitHub Actions CI, Husky + lint-staged, Renovate |

---

## Architecture

### System overview

```
                         ┌────────────────────────────────────────────┐
  Browser                │  apps/web  (React SPA, Vite)                │
  ───────                │  pages/ (features) · common/ (shared) ·     │
  user ───────────────►  │  app/ (router, providers, shell)            │
                         │  TanStack Query cache  ⇄  api-client (fetch)│
                         └──────────────────────┬─────────────────────┘
                                                │ HTTPS  /api/v1/*   (cookies, Idempotency-Key, x-request-id)
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ apps/api  (Express 5)                                                                │
│                                                                                      │
│  helmet → cors → body-parser → request-id → pino-http → rate-limit                   │
│        → [auth] → [validate (Zod)] → routes → 404 → error-handler                    │
│                                                                                      │
│  modules/auth   modules/tasks   modules/health        common/ (db, logger, errors,  │
│  routes → service → repository                         idempotency, outbox, otel…)   │
└───────────────┬──────────────────────────────────────────────────┬───────────────────┘
                │ one transaction: state change + outbox event      │ rate-limit counters
                ▼                                                    ▼
        ┌───────────────┐                                     ┌─────────────┐
        │   MongoDB     │  users · tasks · refresh_tokens ·   │    Redis    │
        │ (replica set) │  idempotency_keys · outbox          │ (prod only) │
        └───────┬───────┘                                     └─────────────┘
                │ polls oldest pending event
                ▼
        ┌──────────────────┐   HMAC-signed POST, retry + circuit breaker
        │ apps/api worker  │ ─────────────────────────────────────────►  webhook (optional)
        └──────────────────┘
```

### Request flow: one direction only

```
API:  router → middleware (parse · auth · validate) → service → repository → MongoDB
Web:  component → custom hook → service → api-client → fetch
```

Each layer only knows the one below it. Route handlers never touch the database. Services never see
`req`/`res`. Components never call `fetch`. Data is validated with Zod **at every boundary**: request
input, env vars, DB reads, API responses on the client, form input and URL search params.

### Key design ideas

| Idea | In one sentence |
|---|---|
| **Feature modules** | A feature (auth, tasks) is one folder that owns its routes/service/repo/schema/tests (API) or components/hooks/services/tests (web). Shared code lives only in `common/`. |
| **Shared contracts** | `packages/contracts` holds the Zod schemas for users, tasks, inputs and errors. The API validates with them and the UI parses responses with them, so the two can't drift apart. |
| **Response envelope** | Every endpoint returns `{ data, error, meta }`, where `meta.requestId` matches the `x-request-id` header and the server logs. |
| **Idempotency keys** | Clients send `Idempotency-Key: <uuid>` on writes. A retry with the same key replays the stored response instead of writing twice. |
| **Transactional outbox** | A task write and its `task.created` event commit in one MongoDB transaction. A separate worker publishes events in order, at least once. |
| **Server state ≠ client state** | API data lives in the TanStack Query cache, the filter in the URL, form state in React Hook Form, tiny UI state in `useState`. There is no global store. |

---

## Repository layout

```
taskflow/
├── packages/
│   └── contracts/            Shared Zod schemas + types (User, Task, inputs, ApiError)
├── apps/
│   ├── api/                  Express 5 REST API + outbox worker
│   │   ├── src/
│   │   │   ├── modules/      auth/ · tasks/ · health/  (one folder per feature)
│   │   │   ├── common/       config, db, logger, errors, http helpers, idempotency,
│   │   │   │                 rate-limit, outbox, resilience, crypto, password, otel
│   │   │   ├── migrations/   versioned, idempotent index/collection setup
│   │   │   ├── test/         test harness (real app + real MongoDB)
│   │   │   ├── app.ts        Express bootstrap & middleware order
│   │   │   ├── server.ts     process entry: start + graceful shutdown
│   │   │   └── worker.ts     outbox publisher process
│   │   ├── scripts/          dev-db (local MongoDB), e2e-server
│   │   └── Dockerfile
│   └── web/                  React SPA
│       ├── src/
│       │   ├── app/          router, providers, layout shell, query client
│       │   ├── pages/        auth/ · tasks/  (one folder per feature)
│       │   ├── common/       ui components, api-client, env, schemas, utils
│       │   └── test/         MSW mock backend + render helper
│       ├── e2e/              Playwright specs
│       └── .storybook/       component workshop
├── docs/CODEBASE_GUIDE.md    ← the deep-dive guide
├── docker-compose.yml        MongoDB (replica set) + Redis + API + worker
├── .github/workflows/ci.yml  format → lint → typecheck → test → audit → e2e
└── biome.json, tsconfig.base.json, pnpm-workspace.yaml, renovate.json
```

---

## Getting started

### Prerequisites

- **Node.js 24** (LTS) and **pnpm 10** (`corepack enable` installs the pinned pnpm)
- Docker is **optional**. Without it, a real `mongod` binary is downloaded and run for you.

### 1. Install

```bash
pnpm install
```

The first install downloads a MongoDB 8 binary (~80 MB) used by the dev database and the tests.

### 2. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
# set JWT_ACCESS_SECRET to a long random string:
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

The web app needs no config in development. `apps/web/.env.example` lists the optional overrides.

### 3. Start MongoDB (pick one)

```bash
pnpm --filter @taskflow/api dev:db     # no Docker: replica set on :27017, data in apps/api/.devdb
# or
docker compose up -d mongo redis       # Docker (then add REDIS_URL=redis://localhost:6379 to .env)
```

### 4. Run the app

```bash
pnpm dev                                   # API on :4000 (runs migrations first) + web on :5173
pnpm --filter @taskflow/api dev:worker     # optional: outbox worker in a second terminal
```

Open **http://localhost:5173**, create an account and start adding tasks.
Vite proxies `/api` to `localhost:4000`, so the browser sees one origin and the cookies just work.

Quick API check: `curl http://localhost:4000/health` and `curl http://localhost:4000/ready`.

---

## Scripts

Run from the repo root (they fan out to every workspace) or with `pnpm --filter <pkg> <script>`.

| Command | Description |
|---|---|
| `pnpm dev` | API (watch mode) + web dev server |
| `pnpm build` | Build API (`tsup` → `apps/api/dist`) and web (`vite build` → `apps/web/dist`) |
| `pnpm format` / `pnpm format:check` | Biome (API, contracts) and Oxfmt (web) |
| `pnpm lint` | Biome lint (API) + Oxlint (web, includes the module-boundary rule) |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm test` | All Vitest suites (API integration + web RTL/MSW), one workspace at a time |
| `pnpm audit` | Production dependency audit (fails on high severity) |
| `pnpm --filter @taskflow/api dev:db` | Local MongoDB replica set without Docker |
| `pnpm --filter @taskflow/api migrate` | Apply database migrations |
| `pnpm --filter @taskflow/api dev:worker` | Run the outbox worker in watch mode |
| `pnpm --filter @taskflow/api start` / `start:worker` | Run the production build (with OpenTelemetry preloaded) |
| `pnpm --filter @taskflow/web e2e` | Playwright E2E (boots a throwaway API + MongoDB automatically) |
| `pnpm --filter @taskflow/web storybook` | Storybook on :6006 |

A **pre-commit hook** formats and lints staged files, then typechecks. CI runs the full gate on
every push and pull request.

---

## Configuration

API environment variables (`apps/api/.env`). They're validated at startup, and the process exits
with a readable message if any is invalid.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | HTTP port |
| `LOG_LEVEL` | `info` | pino level (`silent` in tests) |
| `MONGO_URI` | **required** | Must point at a replica set (transactions) |
| `REDIS_URL` | — | Rate-limit store. **Required in production.** |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `JWT_ACCESS_SECRET` | **required** | ≥ 32 chars, signs access tokens |
| `ACCESS_TOKEN_TTL_SEC` / `REFRESH_TOKEN_TTL_SEC` | `900` / `604800` | Session lifetimes |
| `AUTH_RATE_LIMIT` | `20` | Auth attempts per IP per 15 min |
| `OUTBOX_WEBHOOK_URL` / `OUTBOX_WEBHOOK_SECRET` | — | Where the worker POSTs events (HMAC-signed) |
| `REQUEST_TIMEOUT_MS` / `DB_TIMEOUT_MS` / `OUTBOUND_TIMEOUT_MS` | `30000` / `10000` / `5000` | Must satisfy outbound < DB < request |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Max drain time on SIGTERM |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_SERVICE_NAME` | — / `taskflow-api` | Enables OpenTelemetry traces + metrics |

Web (`apps/web/.env`, optional): `VITE_API_URL` (empty = same origin) and `VITE_API_TIMEOUT_MS`
(default `10000`).

---

## API reference

Base path: `/api/v1`. Every response uses this envelope:

```json
{ "data": { }, "error": null, "meta": { "requestId": "…" } }
{ "data": null, "error": { "code": "NOT_FOUND", "message": "Task not found" }, "meta": { "requestId": "…" } }
```

Writes marked 🔑 require an `Idempotency-Key: <uuid>` header. 🔒 requires a signed-in session cookie.

| Method & path | | Body / query | Success |
|---|---|---|---|
| `GET /health` | | — | `200 { status: "ok" }`: the process is alive |
| `GET /ready` | | — | `200 { status: "ready" }`, or `503` when the DB is down or shutting down |
| `POST /auth/register` | 🔑 | `{ email, name, password }` | `201 User` (doesn't sign in) |
| `POST /auth/login` | | `{ email, password }` | `200 User` + sets `tf_at`, `tf_rt` cookies |
| `POST /auth/refresh` | | (refresh cookie) | `200 User` + rotated cookies |
| `POST /auth/logout` | | — | `200 { loggedOut: true }` + clears cookies |
| `GET /auth/me` | 🔒 | — | `200 User` |
| `GET /tasks` | 🔒 | `?limit=1-50&cursor=<id>&status=todo\|in_progress\|done` | `200 Task[]`, `meta.nextCursor` |
| `POST /tasks` | 🔒🔑 | `{ title, description? }` | `201 Task` |
| `GET /tasks/:id` | 🔒 | — | `200 Task` |
| `PATCH /tasks/:id` | 🔒🔑 | any of `{ title, description, status }` | `200 Task` |
| `DELETE /tasks/:id` | 🔒🔑 | — | `200 { id }` |

Common error codes: `VALIDATION_FAILED` (400, with `details`), `UNAUTHORIZED` (401), `NOT_FOUND`
(404), `EMAIL_TAKEN` / `IDEMPOTENCY_IN_PROGRESS` (409), `IDEMPOTENCY_KEY_REUSED` (422),
`RATE_LIMITED` (429), `INTERNAL` (500), `UNAVAILABLE` (503).

Outbox events: `user.registered`, `task.created`, `task.updated` (with `changed` fields) and
`task.deleted`. They're delivered to `OUTBOX_WEBHOOK_URL` with an `x-signature: sha256=<hmac>` header,
which consumers verify with `verifyWebhookSignature()` in `apps/api/src/common/crypto.ts`.

---

## Testing

| Suite | Where | What it proves |
|---|---|---|
| API integration (bulk) | `apps/api/src/**/*.test.ts` | Boots the real Express app with supertest against a **real MongoDB replica set** (no DB mocks): auth & sessions, refresh-token reuse detection, rate limiting, idempotency replay/reuse, ownership, cursor pagination, outbox ordering/backoff/dead-letter, readiness, malformed input |
| API unit | `common/resilience.test.ts` | Pure logic only: backoff math, retry policy, HMAC signatures |
| Web integration (bulk) | `apps/web/src/pages/**/*.test.tsx` | The real app (router, Query, forms) rendered with RTL; the network mocked at the boundary with MSW (set to fail on any unmocked request). Written as user journeys. |
| Web unit | `pages/tasks/hooks/task-cache.test.ts` | Pure cache transforms behind optimistic updates |
| E2E | `apps/web/e2e/` | Chromium: sign up → add task → complete → filter → delete → reload (session persists) → sign out |
| Components | `*.stories.tsx` | Storybook with accessibility checks set to fail on violations |

Current status: **58 tests pass** (37 API + 21 web). Format, lint, strict typecheck, builds and
`pnpm audit` are all green.

---

## Deployment

- **Container**: `apps/api/Dockerfile` is multi-stage, builds with a frozen lockfile and runs as
  `USER node`. `docker compose up --build` starts MongoDB, Redis, the API and the worker.
- **Order on deploy**: run `pnpm --filter @taskflow/api migrate` first, then roll out the API and
  worker. Probes: liveness `/health`, readiness `/ready`.
- **Scale**: one process per container. Scale with replicas. The worker preserves event order when
  run as a single instance.
- **Web**: `pnpm --filter @taskflow/web build` produces static files in `apps/web/dist`. Serve them
  behind the same domain as the API (reverse proxy `/api`) so cookies stay first-party.
- **Live deploy**: `deploy/docker-compose.prod.yml` runs MongoDB, Redis, a one-shot migration, the API,
  the worker and an nginx web container (static app + `/api` proxy). Copy `deploy/prod.env.example`
  to `deploy/prod.env`, then `docker compose -f deploy/docker-compose.prod.yml -p taskflow up -d --build`.
- **Production must-haves**: `NODE_ENV=production` (secure cookies), `REDIS_URL`, a strong
  `JWT_ACCESS_SECRET`, and `OTEL_EXPORTER_OTLP_ENDPOINT` if you want traces and metrics.

---

## Design decisions & deviations

| The playbooks suggest | This repo does | Why |
|---|---|---|
| Postgres + Kysely/Objection | MongoDB + the official driver | It's a **MERN** project. The same principles hold: a repository at the data edge returning Zod-validated entities, transactions, and an outbox. |
| Testcontainers | `mongodb-memory-server` replica set | Same intent (a real database, never mocks) without requiring Docker |
| Redis for rate-limit counters | Redis when `REDIS_URL` is set, required in production | Dev and tests fall back to memory so the project runs with zero infrastructure |
| Idempotency-Key on every write | Every resource write. Not login/refresh/logout. | Those responses carry `Set-Cookie` credentials that must never be stored for replay, and each is safe to retry by design. |
| Crash on programmer errors | Send a safe 500 first, then graceful shutdown with exit 1 | The in-flight request still gets an answer; the supervisor restarts the process clean |
| TypeScript 7 | TypeScript 5.9 | tsup and Storybook docgen still rely on the TS 5 JS API |

The full rule-by-rule mapping to both playbooks is in
[`docs/CODEBASE_GUIDE.md` → Playbook compliance](docs/CODEBASE_GUIDE.md#12-playbook-compliance-map).
