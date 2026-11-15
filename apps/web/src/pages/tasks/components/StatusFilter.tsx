import { Link } from '@tanstack/react-router'
import type { TaskStatus } from '@/common/lib/schemas'
import { cn } from '@/common/lib/utils'
import { STATUS_LABELS } from './status-labels'

const FILTERS: { value: TaskStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'todo', label: STATUS_LABELS.todo },
  { value: 'in_progress', label: STATUS_LABELS.in_progress },
  { value: 'done', label: STATUS_LABELS.done },
]

// Filter state lives in the URL (?status=done): shareable, bookmarkable, survives reloads.
export const StatusFilter = ({ active }: { active: TaskStatus | undefined }) => (
  <nav aria-label="Filter tasks by status" className="flex gap-1">
    {FILTERS.map(({ value, label }) => (
      <Link
        key={label}
        to="/tasks"
        search={value ? { status: value } : {}}
        aria-current={active === value ? 'page' : undefined}
        className={cn(
          'rounded-md px-3 py-1 text-sm',
          active === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
        )}
      >
        {label}
      </Link>
    ))}
  </nav>
)
