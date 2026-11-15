import { Router } from 'express'
import type { Database } from '../../common/db.js'
import { ServiceUnavailable } from '../../common/errors.js'
import { send } from '../../common/http.js'

export interface Lifecycle {
  readonly shuttingDown: boolean
}

// /health = liveness ("the process is up"). /ready = "I can serve traffic right now".
export const createHealthRouter = ({
  database,
  lifecycle,
}: {
  database: Database
  lifecycle: Lifecycle
}) => {
  const router = Router()

  router.get('/health', (req, res) => {
    send(req, res, { status: 'ok' })
  })

  router.get('/ready', async (req, res) => {
    if (lifecycle.shuttingDown) throw new ServiceUnavailable('Shutting down')
    try {
      await database.ping()
    } catch {
      throw new ServiceUnavailable('Database unreachable')
    }
    send(req, res, { status: 'ready' })
  })

  return router
}
