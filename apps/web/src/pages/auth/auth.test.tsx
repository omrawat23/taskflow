import { screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { db, seedUser, signIn } from '@/test/msw/db'
import { renderApp } from '@/test/render'

describe('sign in', () => {
  test('shows error when password is empty', async () => {
    const { user } = renderApp('/login')
    await user.type(await screen.findByLabelText(/email/i), 'pat@x.com')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument()
  })

  test('shows the server message when the credentials are wrong', async () => {
    seedUser({ email: 'pat@example.com', password: 'correct horse' })
    const { user } = renderApp('/login')
    await user.type(await screen.findByLabelText(/email/i), 'pat@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i)
  })

  test('redirects to /tasks after successful login and greets the user', async () => {
    seedUser({ email: 'pat@example.com', password: 'correct horse', name: 'Pat' })
    const { user, router } = renderApp('/login')
    await user.type(await screen.findByLabelText(/email/i), 'pat@example.com')
    await user.type(screen.getByLabelText(/password/i), 'correct horse')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tasks'))
    expect(await screen.findByText('Pat')).toBeInTheDocument()
  })

  test('sends signed-out visitors from /tasks to /login and back after signing in', async () => {
    seedUser({ email: 'pat@example.com', password: 'correct horse' })
    const { user, router } = renderApp('/tasks?status=done')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    await user.type(await screen.findByLabelText(/email/i), 'pat@example.com')
    await user.type(screen.getByLabelText(/password/i), 'correct horse')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(router.state.location.href).toBe('/tasks?status=done'))
  })

  test('ignores an off-site redirect target', async () => {
    seedUser({ email: 'pat@example.com', password: 'correct horse' })
    const { user, router } = renderApp('/login?redirect=//evil.example.com')
    await user.type(await screen.findByLabelText(/email/i), 'pat@example.com')
    await user.type(screen.getByLabelText(/password/i), 'correct horse')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tasks'))
  })
})

describe('registration and sign out', () => {
  test('creates an account and lands on the task list', async () => {
    const { user, router } = renderApp('/register')
    await user.type(await screen.findByLabelText(/name/i), 'Robin')
    await user.type(screen.getByLabelText(/email/i), 'robin@example.com')
    await user.type(screen.getByLabelText(/password/i), 'long enough password')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tasks'))
    expect(db.users.map((u) => u.email)).toContain('robin@example.com')
  })

  test('shows a validation error for a short password without calling the API', async () => {
    const { user } = renderApp('/register')
    await user.type(await screen.findByLabelText(/name/i), 'Robin')
    await user.type(screen.getByLabelText(/email/i), 'robin@example.com')
    await user.type(screen.getByLabelText(/password/i), 'short')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(db.users).toHaveLength(0)
  })

  test('logs out and returns to the sign-in page', async () => {
    signIn(seedUser())
    const { user, router } = renderApp('/tasks')
    await user.click(await screen.findByRole('button', { name: /log out/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(db.sessionUserId).toBeNull()
  })
})
