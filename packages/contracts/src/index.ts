// One contract that becomes the truth everywhere downstream: the API validates requests and
// entities against these schemas, and the web app parses every response with them.
import { z } from 'zod'

export const ObjectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

// ---------- Users & auth ----------
export const User = z.object({
  id: ObjectIdString,
  email: z.email(),
  name: z.string().min(1).max(80),
  createdAt: z.iso.datetime(),
})
export type User = z.infer<typeof User>

export const RegisterInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.toLowerCase()),
  name: z.string().trim().min(1, 'Name is required').max(80),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})
export type RegisterInput = z.input<typeof RegisterInput>

export const LoginInput = z.object({
  email: z.email('Enter a valid email').transform((e) => e.toLowerCase()),
  password: z.string().min(1, 'Password is required').max(128),
})
export type LoginInput = z.input<typeof LoginInput>

// ---------- Tasks ----------
export const TaskStatus = z.enum(['todo', 'in_progress', 'done'])
export type TaskStatus = z.infer<typeof TaskStatus>

export const Task = z.object({
  id: ObjectIdString,
  ownerId: ObjectIdString,
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  status: TaskStatus,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Task = z.infer<typeof Task>

export const CreateTaskInput = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).default(''),
})
export type CreateTaskInput = z.input<typeof CreateTaskInput>

export const UpdateTaskInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000),
    status: TaskStatus,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')
export type UpdateTaskInput = z.input<typeof UpdateTaskInput>

export const ListTasksQuery = z.object({
  cursor: ObjectIdString.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: TaskStatus.optional(),
})
export type ListTasksQuery = z.input<typeof ListTasksQuery>

export const TaskPage = z.object({
  items: z.array(Task),
  nextCursor: ObjectIdString.nullable(),
})
export type TaskPage = z.infer<typeof TaskPage>

// ---------- Response envelope: { data, error, meta } on every endpoint ----------
export const ApiError = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
})
export type ApiError = z.infer<typeof ApiError>

export const Meta = z.object({ requestId: z.string() }).loose()
