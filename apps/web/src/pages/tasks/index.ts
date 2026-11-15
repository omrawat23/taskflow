// Public surface of the tasks module.
export { taskKeys } from './hooks/useTasks'

/** Route-level code splitting: the router lazy-loads the page through this entry point. */
export const loadTasksPage = () => import('./TasksPage')
