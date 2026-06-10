import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('browse a table → edit a cell → save succeeds', async ({ page }) => {
  await page.goto(APP_PATH)

  // open the read-write connection
  await page.getByRole('button', { name: 'main', exact: true }).click()

  // hover the orders row to reveal the action buttons, then click browse
  await page.getByText('orders', { exact: true }).hover()
  await page.getByRole('button', { name: '編輯資料 orders' }).click()

  // edit-mode toggle is visible (read-only by default)
  await page.getByRole('button', { name: '編輯', exact: true }).click()

  // edit the first row's label cell
  await page.getByLabel('編輯 label 第 1 列').fill('edited-by-e2e')

  // pending count appears
  await expect(page.getByText(/待儲存/)).toBeVisible()

  // save → success clears staged edits + exits edit mode (edit button returns)
  await page.getByRole('button', { name: /儲存/ }).click()
  await expect(page.getByRole('button', { name: '編輯', exact: true })).toBeVisible()

  // no pending count banner remains
  await expect(page.getByText(/待儲存/)).toHaveCount(0)
})
