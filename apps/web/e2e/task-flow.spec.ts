import { expect, test } from '@playwright/test'

test('a new user signs up, completes a task, filters, deletes it and signs out', async ({
  page,
}) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`

  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByRole('link', { name: /create one/i }).click()

  await page.getByLabel('Name').fill('E2E User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a long enough password')
  await page.getByRole('button', { name: /create account/i }).click()

  await expect(page).toHaveURL(/\/tasks/)
  await expect(page.getByText('E2E User')).toBeVisible()
  await expect(page.getByText(/no tasks here yet/i)).toBeVisible()

  await page.getByLabel(/^title/i).fill('Ship the release')
  await page.getByRole('button', { name: /add task/i }).click()
  await expect(page.getByText('Ship the release')).toBeVisible()

  await page.getByLabel(/status of ship the release/i).selectOption('done')
  await page.getByRole('link', { name: 'Done' }).click()
  await expect(page).toHaveURL(/status=done/)
  await expect(page.getByText('Ship the release')).toBeVisible()

  await page.getByRole('button', { name: /delete "ship the release"/i }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^delete$/i })
    .click()
  await expect(page.getByText('Ship the release')).toBeHidden()

  // The session survives a full reload (httpOnly cookies, not localStorage).
  await page.reload()
  await expect(page.getByText('E2E User')).toBeVisible()

  await page.getByRole('button', { name: /log out/i }).click()
  await expect(page).toHaveURL(/\/login/)
})
