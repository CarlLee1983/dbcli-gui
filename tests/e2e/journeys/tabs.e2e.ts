// tests/e2e/journeys/tabs.e2e.ts
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('a second tab runs queries independently of the first', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main' }).click()

  // tab 1: query orders
  const editor = page.getByRole('textbox', { name: 'SQL 查詢' })
  await editor.fill('SELECT * FROM orders')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('orders-row-1')).toBeVisible()

  // open tab 2: fresh empty session, no result
  await page.getByRole('button', { name: '開新分頁' }).click()
  await expect(editor).toHaveValue('')
  await expect(page.getByText('orders-row-1')).toHaveCount(0)

  // run a different query in tab 2
  await editor.fill('SELECT * FROM users')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('a@example.com')).toBeVisible()

  // back to tab 1: its orders result is preserved
  await page.getByText('查詢 1').click()
  await expect(page.getByText('orders-row-1')).toBeVisible()
  await expect(editor).toHaveValue('SELECT * FROM orders')
})
