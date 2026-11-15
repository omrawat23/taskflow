import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetDb } from './msw/db'
import { server } from './msw/server'

// jsdom has no layout engine; the router's scroll restoration calls scrollTo on navigation.
window.scrollTo = () => {}

// Mock at the network boundary only — components, hooks and the API client run for real.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetDb()
})
afterAll(() => server.close())
