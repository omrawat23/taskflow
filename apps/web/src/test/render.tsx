import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/app/App'
import { createAppRouter } from '@/app/router'

/** Renders the real app (real router, real providers) at `path`. */
export const renderApp = (path: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }))
  const user = userEvent.setup()
  render(<App queryClient={queryClient} router={router} />)
  return { user, router, queryClient }
}
