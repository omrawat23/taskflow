import { z } from 'zod'
import { apiClient } from '@/common/lib/api-client'
import { type CreateTaskInputValues, Task, type TaskStatus } from '@/common/lib/schemas'

export interface TaskPage {
  items: Task[]
  nextCursor: string | null
}

const PageMeta = z.object({ nextCursor: z.string().nullable() })

// API calls scoped to the tasks module.
export const tasksService = {
  list: async ({
    cursor,
    status,
    signal,
  }: {
    cursor?: string | undefined
    status?: TaskStatus | undefined
    signal?: AbortSignal
  }): Promise<TaskPage> => {
    const res = await apiClient.get('/api/v1/tasks', z.array(Task), {
      query: { cursor, status, limit: 20 },
      ...(signal ? { signal } : {}),
    })
    return { items: res.data, nextCursor: PageMeta.parse(res.meta).nextCursor }
  },

  create: async (input: CreateTaskInputValues, idempotencyKey: string): Promise<Task> =>
    (await apiClient.post('/api/v1/tasks', Task, { body: input, idempotencyKey })).data,

  update: async (
    id: string,
    patch: { status?: TaskStatus; title?: string; description?: string },
    idempotencyKey: string,
  ): Promise<Task> =>
    (await apiClient.patch(`/api/v1/tasks/${id}`, Task, { body: patch, idempotencyKey })).data,

  remove: async (id: string, idempotencyKey: string): Promise<void> => {
    await apiClient.delete(`/api/v1/tasks/${id}`, z.object({ id: z.string() }), { idempotencyKey })
  },
}
