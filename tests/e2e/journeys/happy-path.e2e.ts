import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('connect → browse schema → run query → see rows', async ({ page }) => {
  await page.goto(APP_PATH)

  // connections listed in the sidebar; pick the default one
  await page.getByRole('button', { name: 'main', exact: true }).click()

  // schema tree shows the (non-blacklisted) tables
  await expect(page.getByRole('button', { name: 'orders', exact: true })).toBeVisible()

  // write SQL and run it
  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill('SELECT * FROM orders')
  await page.getByRole('button', { name: 'Run' }).click()

  // result grid renders the seeded rows
  await expect(page.locator('td[data-col="id"]').first()).toBeVisible()
  await expect(page.getByText('orders-row-1')).toBeVisible()
  // Scope to <footer> to avoid matching the same count shown in the HistoryPanel entry.
  await expect(page.locator('footer').filter({ hasText: /3 列/ })).toBeVisible()
})
