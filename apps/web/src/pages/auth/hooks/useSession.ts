import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { LoginInputValues, RegisterInputValues, User } from '@/common/lib/schemas'
import { authService } from '../services/auth.service'

// The current user is server state: it lives in the Query cache, not in a global store.
export const currentUserQuery = queryOptions({
  queryKey: ['auth', 'me'] as const,
  queryFn: authService.me,
  staleTime: 5 * 60_000,
  retry: false,
})

export const useCurrentUser = () => useQuery(currentUserQuery)

export const useLogin = (redirectTo: string) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (input: LoginInputValues) => authService.login(input),
    onSuccess: async (user: User) => {
      queryClient.setQueryData(currentUserQuery.queryKey, user)
      await navigate({ href: redirectTo }) // may carry a query string, e.g. /tasks?status=done
    },
  })
}

export const useRegister = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    // One idempotency key per submission: retries of this mutation replay instead of re-creating.
    mutationFn: async ({ input, key }: { input: RegisterInputValues; key: string }) => {
      await authService.register(input, key)
      return authService.login({ email: input.email, password: input.password })
    },
    retry: (count, err) => count < 2 && err instanceof TypeError, // network failures only
    onSuccess: async (user: User) => {
      queryClient.setQueryData(currentUserQuery.queryKey, user)
      await navigate({ to: '/tasks' })
    },
  })
}

export const useLogout = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: authService.logout,
    onSettled: async () => {
      queryClient.clear() // nothing from the previous session may leak into the next one
      queryClient.setQueryData(currentUserQuery.queryKey, null)
      await navigate({ to: '/login' })
    },
  })
}
