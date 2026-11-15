import { z } from 'zod'
import { apiClient, isApiError } from '@/common/lib/api-client'
import { type LoginInputValues, type RegisterInputValues, User } from '@/common/lib/schemas'

// API calls scoped to the auth module. Responses are Zod-parsed inside apiClient.
export const authService = {
  /** The signed-in user, or null when there is no valid session. */
  me: async (): Promise<User | null> => {
    try {
      return (await apiClient.get('/api/v1/auth/me', User)).data
    } catch (err) {
      if (isApiError(err) && err.status === 401) return null
      throw err
    }
  },

  login: async (input: LoginInputValues): Promise<User> =>
    (await apiClient.post('/api/v1/auth/login', User, { body: input })).data,

  register: async (input: RegisterInputValues, idempotencyKey: string): Promise<User> =>
    (await apiClient.post('/api/v1/auth/register', User, { body: input, idempotencyKey })).data,

  logout: async (): Promise<void> => {
    await apiClient.post('/api/v1/auth/logout', z.object({ loggedOut: z.literal(true) }))
  },
}
