// tests/e2e/journeys/history.e2e.ts
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('running a query records it in history and clicking reloads the SQL', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'SQL 查詢' })
  await editor.fill('SELECT * FROM orders')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('orders-row-1')).toBeVisible()

  // history panel shows the query（HistoryPanel 的 <aside aria-label="查詢歷史">）
  const historyPanel = page.getByRole('complementary', { name: '查詢歷史' })
  await expect(historyPanel.getByText('SELECT * FROM orders')).toBeVisible()

  // change the editor, then click history to reload
  await editor.fill('SELECT 1')
  await historyPanel.getByText('SELECT * FROM orders').click()
  await expect(editor).toHaveValue('SELECT * FROM orders')
})
