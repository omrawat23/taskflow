import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateTaskInputValues, Task, TaskStatus } from '@/common/lib/schemas'
import { tasksService } from '../services/tasks.service'
import { patchTaskInPages, removeTaskFromPages, type TaskPages } from './task-cache'

export const taskKeys = {
  all: ['tasks'] as const,
  list: (status: TaskStatus | undefined) => ['tasks', 'list', { status: status ?? 'all' }] as const,
}

/** Cursor-paginated list; stale-while-revalidate keeps the cached list on screen while refetching. */
export const useTasks = (status: TaskStatus | undefined) =>
  useInfiniteQuery({
    queryKey: taskKeys.list(status),
    queryFn: ({ pageParam, signal }) => tasksService.list({ cursor: pageParam, status, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  })

/** Writes carry one Idempotency-Key per user action, so automatic retries are safe. */
const retryNetworkErrors = (count: number, err: Error) => count < 2 && err instanceof TypeError

export const useCreateTask = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, key }: { input: CreateTaskInputValues; key: string }) =>
      tasksService.create(input, key),
    retry: retryNetworkErrors,
    // Targeted invalidation: refetch only task lists.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  })
}

/** Optimistic update: the cache changes immediately and rolls back if the server says no. */
export const useUpdateTaskStatus = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, key }: { id: string; status: TaskStatus; key: string }) =>
      tasksService.update(id, { status }, key),
    retry: retryNetworkErrors,
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all })
      const snapshot = queryClient.getQueriesData<TaskPages>({ queryKey: taskKeys.all })
      queryClient.setQueriesData<TaskPages>({ queryKey: taskKeys.all }, (data) =>
        patchTaskInPages(data, id, { status } satisfies Partial<Task>),
      )
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  })
}

export const useDeleteTask = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) => tasksService.remove(id, key),
    retry: retryNetworkErrors,
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all })
      const snapshot = queryClient.getQueriesData<TaskPages>({ queryKey: taskKeys.all })
      queryClient.setQueriesData<TaskPages>({ queryKey: taskKeys.all }, (data) =>
        removeTaskFromPages(data, id),
      )
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  })
}
