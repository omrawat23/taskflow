import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type RouterHistory,
  redirect,
} from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { z } from 'zod'
import { Spinner } from '@/common/components/ui/feedback'
import { TaskStatus } from '@/common/lib/schemas'
import { currentUserQuery, LoginPage, RegisterPage } from '@/pages/auth'
import { loadTasksPage } from '@/pages/tasks'
import { AppShell, NotFound } from './AppShell'

interface RouterContext {
  queryClient: QueryClient
}

// URL state is validated at the boundary like any other input.
// `redirect` must be an in-app path ("/…" but not "//host") to prevent open redirects.
const SafeRedirect = z
  .string()
  .regex(/^\/(?!\/)/)
  .optional()
  .catch(undefined)
const AuthSearch = z.object({ redirect: SafeRedirect })
const TasksSearch = z.object({ status: TaskStatus.optional().catch(undefined) })

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFound,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/tasks' })
  },
})

const redirectIfSignedIn = async ({ context }: { context: RouterContext }) => {
  if (await context.queryClient.ensureQueryData(currentUserQuery)) throw redirect({ to: '/tasks' })
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: AuthSearch,
  beforeLoad: redirectIfSignedIn,
  component: function Login() {
    const { redirect: to } = loginRoute.useSearch()
    return <LoginPage redirectTo={to ?? '/tasks'} />
  },
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  beforeLoad: redirectIfSignedIn,
  component: RegisterPage,
})

// Route-level code splitting: the tasks bundle loads only when the route is visited.
const LazyTasksPage = lazy(loadTasksPage)

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  validateSearch: TasksSearch,
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery)
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  component: function Tasks() {
    const { status } = tasksRoute.useSearch()
    return (
      <Suspense fallback={<Spinner label="Loading page" />}>
        <LazyTasksPage status={status} />
      </Suspense>
    )
  },
})

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, registerRoute, tasksRoute])

export const createAppRouter = (queryClient: QueryClient, history?: RouterHistory) =>
  createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    ...(history ? { history } : {}),
  })

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
