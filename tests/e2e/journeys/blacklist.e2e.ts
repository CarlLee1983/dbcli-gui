import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('a blacklisted table is hidden from the tree and rejected on query', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main', exact: true }).click()

  // table-level: secret_table never appears in the schema tree
  await expect(page.getByRole('button', { name: 'orders', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'secret_table', exact: true })).toHaveCount(0)

  // querying it is rejected with the BLACKLISTED friendly message
  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill('SELECT * FROM secret_table')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('此表受保護，無法存取')).toBeVisible()
})

test('a blacklisted column is omitted from query results', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main', exact: true }).click()

  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill('SELECT * FROM users')
  await page.getByRole('button', { name: 'Run' }).click()

  // email is shown, but the blacklisted password column is filtered out
  await expect(page.locator('td[data-col="email"]').first()).toBeVisible()
  await expect(page.locator('th', { hasText: 'password' })).toHaveCount(0)
  await expect(page.locator('td[data-col="password"]')).toHaveCount(0)
})
