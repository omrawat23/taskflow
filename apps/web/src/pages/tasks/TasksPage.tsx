import { Card } from '@/common/components/ui/card'
import type { TaskStatus } from '@/common/lib/schemas'
import { NewTaskForm } from './components/NewTaskForm'
import { StatusFilter } from './components/StatusFilter'
import { TaskList } from './components/TaskList'

// Route component: composes the feature. `status` comes from the URL (validated by the router).
const TasksPage = ({ status }: { status: TaskStatus | undefined }) => (
  <div className="mx-auto grid w-full max-w-2xl gap-6 p-4">
    <Card>
      <Card.Header>
        <Card.Title>New task</Card.Title>
      </Card.Header>
      <Card.Body>
        <NewTaskForm />
      </Card.Body>
    </Card>
    <Card>
      <Card.Header className="flex flex-wrap items-center justify-between gap-2">
        <Card.Title>Your tasks</Card.Title>
        <StatusFilter active={status} />
      </Card.Header>
      <Card.Body>
        <TaskList status={status} />
      </Card.Body>
    </Card>
  </div>
)

export default TasksPage
