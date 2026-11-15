import type { InfiniteData } from '@tanstack/react-query'
import type { Task } from '@/common/lib/schemas'
import type { TaskPage } from '../services/tasks.service'

// Pure cache transforms used by optimistic updates (unit-tested in task-cache.test.ts).

export type TaskPages = InfiniteData<TaskPage, string | undefined>

export const patchTaskInPages = (
  data: TaskPages | undefined,
  id: string,
  patch: Partial<Task>,
): TaskPages | undefined =>
  data && {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    })),
  }

export const removeTaskFromPages = (
  data: TaskPages | undefined,
  id: string,
): TaskPages | undefined =>
  data && {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((task) => task.id !== id),
    })),
  }
