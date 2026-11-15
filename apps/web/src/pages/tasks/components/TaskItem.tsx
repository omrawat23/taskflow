import type { Task, TaskStatus } from '@/common/lib/schemas'
import { cn } from '@/common/lib/utils'
import { DeleteTaskButton } from './DeleteTaskButton'
import { STATUS_LABELS } from './status-labels'

interface TaskItemProps {
  task: Task
  onStatusChange: (status: TaskStatus) => void
  onDelete: () => void
}

// Presentational: props in, JSX out. The list owns the mutations.
export const TaskItem = ({ task, onStatusChange, onDelete }: TaskItemProps) => (
  <li className="flex items-start gap-3 rounded-md border border-border p-3">
    <div className="grid flex-1 gap-1">
      <p
        className={cn(
          'font-medium',
          task.status === 'done' && 'text-muted-foreground line-through',
        )}
      >
        {task.title}
      </p>
      {task.description ? (
        <p className="text-sm text-muted-foreground">{task.description}</p>
      ) : null}
    </div>
    <label className="sr-only" htmlFor={`status-${task.id}`}>
      Status of {task.title}
    </label>
    <select
      id={`status-${task.id}`}
      value={task.status}
      onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
      className="h-8 rounded-md border border-border bg-background px-2 text-sm"
    >
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
    <DeleteTaskButton title={task.title} onConfirm={onDelete} />
  </li>
)
