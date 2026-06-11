import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('right-clicking a result cell opens the copy menu', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main', exact: true }).click()

  const editor = page.getByRole('textbox', { name: 'SQL 查詢' })
  await editor.fill('SELECT * FROM orders')
  await expect(editor).toHaveText('SELECT * FROM orders')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('orders-row-1')).toBeVisible()

  // Right-click a cell → the copy context menu appears (rendered via a body portal).
  await page.getByText('orders-row-1').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: '複製儲存格' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '複製整列 (TSV)' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '複製列為 CSV' })).toBeVisible()

  // Selecting an item runs the copy and dismisses the menu.
  await page.getByRole('menuitem', { name: '複製儲存格' }).click()
  await expect(page.getByRole('menuitem', { name: '複製儲存格' })).toHaveCount(0)
})
