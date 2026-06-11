import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('open a table tab, switch all five sub-tabs, then open a new query', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main', exact: true }).click()

  // table-name click opens the table tab (defaults to Structure)
  await page.getByRole('button', { name: /^orders/ }).first().click()
  await expect(page.getByRole('button', { name: '結構' })).toBeVisible()

  // Structure shows columns + the 說明 (comment) column with the seeded comment text
  await expect(page.getByText('id', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '說明' })).toBeVisible()
  await expect(page.getByText('訂單主鍵')).toBeVisible()
  // Extra column surfaces auto-increment from the schema
  await expect(page.getByRole('columnheader', { name: 'Extra' })).toBeVisible()
  await expect(page.getByText('AUTO_INCREMENT')).toBeVisible()

  // Triggers (lazy)
  await page.getByRole('button', { name: '觸發器' }).click()
  await expect(page.getByText('trg_demo')).toBeVisible()

  // Info (lazy)
  await page.getByRole('button', { name: '資訊' }).click()
  await expect(page.getByText('InnoDB')).toBeVisible()

  // Relations (lazy) — reverse reference visible
  await page.getByRole('button', { name: '關聯' }).click()
  await expect(page.getByText(/order_items/)).toBeVisible()

  // Content → editable browser. The tab opened on Structure, so its rows are fetched
  // on demand when Content is first shown — the actual row values must appear.
  await page.getByRole('button', { name: '內容' }).click()
  await expect(page.getByRole('button', { name: '編輯', exact: true })).toBeVisible()
  await expect(page.getByText('orders-row-1')).toBeVisible()

  // Clicking the id header re-fetches sorted ascending, then descending — the server
  // returns reordered rows (asc: row-1 first; desc: row-3 first).
  const firstLabel = () => page.locator('tbody tr td').nth(1)
  await page.getByRole('columnheader', { name: 'id' }).click()
  await expect(firstLabel()).toHaveText('orders-row-1')
  await page.getByRole('columnheader', { name: 'id' }).click()
  await expect(firstLabel()).toHaveText('orders-row-3')

  // Open a new query prefilled from this table
  await page.getByRole('button', { name: /以此表開新查詢/ }).click()
  await expect(page.getByLabel('SQL 查詢')).toHaveValue(/SELECT \* FROM orders/)
})
