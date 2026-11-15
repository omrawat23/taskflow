import { screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, test } from 'vitest'
import { db, seedTask, seedUser, signIn } from '@/test/msw/db'
import { fail } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/render'

let ownerId: string
beforeEach(() => {
  const user = seedUser()
  signIn(user)
  ownerId = user.id
})

const taskTitles = async () => {
  const list = await screen.findByRole('list', { name: /tasks/i })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.querySelector('p')?.textContent)
}

describe('task list', () => {
  test('shows the newest tasks first', async () => {
    seedTask(ownerId, 'Older task')
    seedTask(ownerId, 'Newer task')
    renderApp('/tasks')
    expect(await taskTitles()).toEqual(['Newer task', 'Older task'])
  })

  test('shows an empty state when there are no tasks', async () => {
    renderApp('/tasks')
    expect(await screen.findByText(/no tasks here yet/i)).toBeInTheDocument()
  })

  test('adds a task and shows it in the list', async () => {
    const { user } = renderApp('/tasks')
    await user.type(await screen.findByLabelText(/^title/i), 'Buy milk')
    await user.click(screen.getByRole('button', { name: /add task/i }))
    expect(await screen.findByText('Buy milk')).toBeInTheDocument()
    expect(screen.getByLabelText(/^title/i)).toHaveValue('')
  })

  test('requires a title before adding a task', async () => {
    const { user } = renderApp('/tasks')
    await user.click(await screen.findByRole('button', { name: /add task/i }))
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument()
    expect(db.tasks).toHaveLength(0)
  })

  test('filters by status through the URL', async () => {
    seedTask(ownerId, 'Still to do')
    seedTask(ownerId, 'Already done', 'done')
    const { user, router } = renderApp('/tasks')
    await screen.findByText('Still to do')
    await user.click(screen.getByRole('link', { name: 'Done' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ status: 'done' }))
    expect(await taskTitles()).toEqual(['Already done'])
  })

  test('marks a task as done', async () => {
    seedTask(ownerId, 'Ship release')
    const { user } = renderApp('/tasks')
    await user.selectOptions(await screen.findByLabelText(/status of ship release/i), 'done')
    await waitFor(() => expect(db.tasks[0]?.status).toBe('done'))
    expect(screen.getByLabelText(/status of ship release/i)).toHaveValue('done')
  })

  test('rolls back an optimistic status change when the server rejects it', async () => {
    seedTask(ownerId, 'Fragile task')
    server.use(http.patch('/api/v1/tasks/:id', () => fail(500, 'INTERNAL', 'Something went wrong')))
    const { user } = renderApp('/tasks')
    const select = await screen.findByLabelText(/status of fragile task/i)
    await user.selectOptions(select, 'done')
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
    await waitFor(() =>
      expect(screen.getByLabelText(/status of fragile task/i)).toHaveValue('todo'),
    )
  })

  test('deletes a task only after confirmation', async () => {
    seedTask(ownerId, 'Throwaway')
    const { user } = renderApp('/tasks')
    await user.click(await screen.findByRole('button', { name: /delete "throwaway"/i }))
    const dialog = screen.getByRole('dialog', { name: /delete task/i })
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(db.tasks).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /delete "throwaway"/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(screen.queryByText('Throwaway')).not.toBeInTheDocument())
    expect(db.tasks).toHaveLength(0)
  })

  test('loads older tasks with the cursor', async () => {
    for (let i = 1; i <= 25; i++) seedTask(ownerId, `Task ${i}`)
    const { user } = renderApp('/tasks')
    expect(await taskTitles()).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: /load more/i }))
    await waitFor(async () => expect(await taskTitles()).toHaveLength(25))
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
  })
})
