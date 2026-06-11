import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('keyboard shortcuts drive tabs and query execution', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main', exact: true }).click()
  await expect(page.getByText('查詢 1')).toBeVisible()

  // ⌘T opens a second query tab.
  await page.keyboard.press('Meta+t')
  await expect(page.getByText('查詢 2')).toBeVisible()

  // ⌘R runs the active tab's query (no Run-button click).
  const editor = page.getByRole('textbox', { name: 'SQL 查詢' })
  await editor.fill('SELECT * FROM orders')
  // Wait for the editor to commit the text (CodeMirror onChange → React state) before ⌘R,
  // so run() never reads a stale/empty query.
  await expect(editor).toHaveText('SELECT * FROM orders')
  await page.keyboard.press('Meta+r')
  await expect(page.getByText('orders-row-1')).toBeVisible()

  // ⌘1 jumps back to the first (still empty) tab.
  await page.keyboard.press('Meta+1')
  await expect(editor).toHaveText('')

  // ⌘W closes the active tab; only 查詢 2 remains.
  await page.keyboard.press('Meta+w')
  await expect(page.getByText('查詢 1')).toHaveCount(0)
  await expect(page.getByText('查詢 2')).toBeVisible()
})
