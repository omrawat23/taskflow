import { QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/common/lib/api-client'

// Never retry client errors (4xx): retrying a 404 or 422 cannot succeed.
const shouldRetry = (failureCount: number, err: unknown) =>
  failureCount < 2 && !(isApiError(err) && err.status < 500)

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  })
