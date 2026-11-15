import { ObjectIdString, type TaskStatus } from '@taskflow/contracts'
import type { ObjectId } from 'mongodb'
import { z } from 'zod'

export {
  CreateTaskInput,
  ListTasksQuery,
  Task,
  TaskPage,
  UpdateTaskInput,
} from '@taskflow/contracts'

export const TaskIdParams = z.object({ id: ObjectIdString })

/** Persistence shape — never leaves the repository. */
export interface TaskDoc {
  _id: ObjectId
  ownerId: ObjectId
  title: string
  description: string
  status: TaskStatus
  createdAt: Date
  updatedAt: Date
}
