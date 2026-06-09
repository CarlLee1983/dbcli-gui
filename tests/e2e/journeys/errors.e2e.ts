import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('a failing query surfaces the error banner and the app stays usable', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main' }).click()

  // The FORCE_ERROR sentinel makes the fake adapter throw a ConnectionError.
  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill("SELECT * FROM orders WHERE label = 'FORCE_ERROR'")
  await page.getByRole('button', { name: 'Run' }).click()

  // ErrorBanner renders: its dismiss button has aria-label="關閉" (exact) — TabBar
  // close buttons use "關閉 <tab-title>" so exact: true keeps the match unique.
  const dismiss = page.getByRole('button', { name: '關閉', exact: true })
  await expect(dismiss).toBeVisible()
  // Tolerant text check covers both the CONNECTION and the INTERNAL friendly mappings.
  await expect(page.getByText(/連線失敗|未預期錯誤/)).toBeVisible()

  // Dismissing clears the banner — the app is still interactive.
  await dismiss.click()
  await expect(dismiss).toBeHidden()
})
