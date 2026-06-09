import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

// In the dev-harness (no window.__DBCLI__ injected), saveFile() uses an <a download>
// anchor, so Playwright's download event fires and we can read the file.
async function runOrdersQuery(page: Page) {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main' }).click()
  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill('SELECT * FROM orders')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.locator('td[data-col="id"]').first()).toBeVisible()
}

test('export CSV downloads the result as comma-separated rows', async ({ page }) => {
  await runOrdersQuery(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('combobox', { name: '匯出格式' }).selectOption('csv'),
  ])
  expect(download.suggestedFilename()).toBe('export.csv')
  const text = await readFile(await download.path(), 'utf8')
  const [header] = text.split('\n')
  expect(header).toContain('id')
  expect(header).toContain('label')
  expect(text).toContain('orders-row-1')
})

test('export JSON downloads the result as a JSON array', async ({ page }) => {
  await runOrdersQuery(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('combobox', { name: '匯出格式' }).selectOption('json'),
  ])
  expect(download.suggestedFilename()).toBe('export.json')
  const parsed = JSON.parse(await readFile(await download.path(), 'utf8')) as Array<Record<string, unknown>>
  expect(parsed).toHaveLength(3)
  expect(parsed[0]).toMatchObject({ id: 1, label: 'orders-row-1' })
})
