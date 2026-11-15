import type { TaskStatus } from '@taskflow/contracts'
import type { Database } from '../../common/db.js'
import { NotFound } from '../../common/errors.js'
import { outboxRepo } from '../../common/outbox.js'
import { tasksRepo } from './tasks.repo.js'
import type { Task, TaskPage } from './tasks.schema.js'

// Every write commits the state change and its outbox event in one transaction.

export const createTasksService = ({ database }: { database: Database }) => {
  const tasks = tasksRepo(database.db)
  const outbox = outboxRepo(database.db)

  return {
    list: (
      ownerId: string,
      query: { cursor?: string | undefined; limit: number; status?: TaskStatus | undefined },
    ): Promise<TaskPage> => tasks.list(ownerId, query),

    get: async (ownerId: string, id: string): Promise<Task> => {
      const task = await tasks.findById(ownerId, id)
      if (!task) throw new NotFound('Task')
      return task
    },

    create: (ownerId: string, cmd: { title: string; description: string }): Promise<Task> =>
      database.withTransaction(async (session) => {
        const task = await tasks.create({ ownerId, ...cmd }, session)
        await outbox.enqueue({ type: 'task.created', payload: task }, session)
        return task
      }),

    update: (
      ownerId: string,
      id: string,
      patch: {
        title?: string | undefined
        description?: string | undefined
        status?: TaskStatus | undefined
      },
    ): Promise<Task> =>
      database.withTransaction(async (session) => {
        const cleanPatch = Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined),
        )
        const task = await tasks.update(ownerId, id, cleanPatch, session)
        if (!task) throw new NotFound('Task')
        await outbox.enqueue(
          { type: 'task.updated', payload: { task, changed: Object.keys(cleanPatch) } },
          session,
        )
        return task
      }),

    remove: (ownerId: string, id: string): Promise<void> =>
      database.withTransaction(async (session) => {
        const deleted = await tasks.delete(ownerId, id, session)
        if (!deleted) throw new NotFound('Task')
        await outbox.enqueue({ type: 'task.deleted', payload: { id, ownerId } }, session)
      }),
  }
}
export type TasksService = ReturnType<typeof createTasksService>
