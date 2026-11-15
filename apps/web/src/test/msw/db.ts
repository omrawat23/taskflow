import type { Task, TaskStatus, User } from '@/common/lib/schemas'

// In-memory backend state for MSW. Reset after every test.
interface StoredUser extends User {
  password: string
}

let counter = 0
/** 24-hex ids, the same shape as MongoDB ObjectIds, so responses pass the real Zod contracts. */
export const nextId = () => (++counter).toString(16).padStart(24, '0')

export const db = {
  users: [] as StoredUser[],
  tasks: [] as Task[],
  sessionUserId: null as string | null,
}

export const resetDb = () => {
  db.users = []
  db.tasks = []
  db.sessionUserId = null
}

export const seedUser = (overrides: Partial<StoredUser> = {}): StoredUser => {
  const user: StoredUser = {
    id: nextId(),
    email: 'pat@example.com',
    name: 'Pat',
    password: 'correct horse',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
  db.users.push(user)
  return user
}

export const signIn = (user: StoredUser) => {
  db.sessionUserId = user.id
}

export const seedTask = (ownerId: string, title: string, status: TaskStatus = 'todo'): Task => {
  const now = new Date().toISOString()
  const task: Task = {
    id: nextId(),
    ownerId,
    title,
    description: '',
    status,
    createdAt: now,
    updatedAt: now,
  }
  db.tasks.push(task)
  return task
}
