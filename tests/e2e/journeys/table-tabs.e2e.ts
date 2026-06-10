import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('open a table tab, switch all five sub-tabs, then open a new query', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main', exact: true }).click()

  // table-name click opens the table tab (defaults to Structure)
  await page.getByRole('button', { name: /^orders/ }).first().click()
  await expect(page.getByRole('button', { name: '結構' })).toBeVisible()

  // Structure shows columns
  await expect(page.getByText('id', { exact: true }).first()).toBeVisible()

  // Triggers (lazy)
  await page.getByRole('button', { name: '觸發器' }).click()
  await expect(page.getByText('trg_demo')).toBeVisible()

  // Info (lazy)
  await page.getByRole('button', { name: '資訊' }).click()
  await expect(page.getByText('InnoDB')).toBeVisible()

  // Relations (lazy) — reverse reference visible
  await page.getByRole('button', { name: '關聯' }).click()
  await expect(page.getByText(/order_items/)).toBeVisible()

  // Content → editable browser
  await page.getByRole('button', { name: '內容' }).click()
  await expect(page.getByRole('button', { name: '編輯', exact: true })).toBeVisible()

  // Open a new query prefilled from this table
  await page.getByRole('button', { name: /以此表開新查詢/ }).click()
  await expect(page.getByLabel('SQL 查詢')).toHaveValue(/SELECT \* FROM orders/)
})
