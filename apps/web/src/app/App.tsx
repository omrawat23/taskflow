import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import type { createAppRouter } from './router'

// Providers live in one place, so tests render the exact same tree as production.
export const App = ({
  queryClient,
  router,
}: {
  queryClient: QueryClient
  router: ReturnType<typeof createAppRouter>
}) => (
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
)
