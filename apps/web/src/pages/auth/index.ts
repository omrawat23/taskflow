// Public surface of the auth module. Other modules import from here, never from internals.
export { currentUserQuery, useCurrentUser, useLogout } from './hooks/useSession'
export { LoginPage } from './LoginPage'
export { RegisterPage } from './RegisterPage'
