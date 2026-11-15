import { type RequestHandler, Router } from 'express'
import { endpoint, send, userId } from '../../common/http.js'
import { CreateTaskInput, ListTasksQuery, TaskIdParams, UpdateTaskInput } from './tasks.schema.js'
import type { TasksService } from './tasks.service.js'

// router → middleware (auth → per-user rate limit → idempotency) → validate → service.
export const createTasksRouter = (deps: {
  service: TasksService
  requireAuth: RequestHandler
  userLimiter: RequestHandler
  idempotency: RequestHandler
}) => {
  const { service, requireAuth, userLimiter, idempotency } = deps
  const router = Router()
  router.use(requireAuth, userLimiter, idempotency)

  router.get(
    '/',
    endpoint({ query: ListTasksQuery }, async ({ query }, req, res) => {
      const page = await service.list(userId(req), query)
      send(req, res, page.items, { meta: { nextCursor: page.nextCursor } })
    }),
  )

  router.post(
    '/',
    endpoint({ body: CreateTaskInput }, async ({ body }, req, res) => {
      send(req, res, await service.create(userId(req), body), { status: 201 })
    }),
  )

  router.get(
    '/:id',
    endpoint({ params: TaskIdParams }, async ({ params }, req, res) => {
      send(req, res, await service.get(userId(req), params.id))
    }),
  )

  router.patch(
    '/:id',
    endpoint(
      { params: TaskIdParams, body: UpdateTaskInput },
      async ({ params, body }, req, res) => {
        send(req, res, await service.update(userId(req), params.id, body))
      },
    ),
  )

  router.delete(
    '/:id',
    endpoint({ params: TaskIdParams }, async ({ params }, req, res) => {
      await service.remove(userId(req), params.id)
      send(req, res, { id: params.id })
    }),
  )

  return router
}
