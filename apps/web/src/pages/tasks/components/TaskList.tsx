import { Button } from '@/common/components/ui/button'
import { ErrorAlert, Spinner } from '@/common/components/ui/feedback'
import type { TaskStatus } from '@/common/lib/schemas'
import { errorMessage } from '@/common/lib/utils'
import { useDeleteTask, useTasks, useUpdateTaskStatus } from '../hooks/useTasks'
import { TaskItem } from './TaskItem'

export const TaskList = ({ status }: { status: TaskStatus | undefined }) => {
  const tasks = useTasks(status)
  const updateStatus = useUpdateTaskStatus()
  const deleteTask = useDeleteTask()

  // Guards first, happy path last.
  if (tasks.isPending) return <Spinner label="Loading tasks" />
  if (tasks.isError) return <ErrorAlert>{errorMessage(tasks.error)}</ErrorAlert>

  const items = tasks.data.pages.flatMap((page) => page.items)
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No tasks here yet.</p>
  }

  const mutationError = updateStatus.error ?? deleteTask.error
  return (
    <div className="grid gap-3">
      {mutationError ? <ErrorAlert>{errorMessage(mutationError)}</ErrorAlert> : null}
      <ul aria-label="Tasks" className="grid gap-2">
        {items.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onStatusChange={(next) =>
              updateStatus.mutate({ id: task.id, status: next, key: crypto.randomUUID() })
            }
            onDelete={() => deleteTask.mutate({ id: task.id, key: crypto.randomUUID() })}
          />
        ))}
      </ul>
      {tasks.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-center"
          disabled={tasks.isFetchingNextPage}
          onClick={() => void tasks.fetchNextPage()}
        >
          {tasks.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  )
}
