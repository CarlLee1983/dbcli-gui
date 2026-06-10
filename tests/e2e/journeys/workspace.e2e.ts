// tests/e2e/journeys/workspace.e2e.ts
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('切換 workspace:專案 → 全域,側欄連線改變且查詢分頁重置', async ({ page }) => {
  await page.goto(APP_PATH)

  // 啟動 active = 專案,應看到 main 連線
  await expect(page.getByRole('button', { name: 'main', exact: true })).toBeVisible()

  // 開第二個查詢分頁(待會驗證重置)
  await page.getByRole('button', { name: '開新分頁' }).click()
  // 確認第二個分頁已開啟
  await expect(page.getByText('查詢 2')).toBeVisible()

  // 開 workspace 下拉 → 選全域(觸發列顯示專案 label,'全域' 只在下拉中出現)
  await page.getByTitle('切換 workspace').click()
  await page.getByRole('button', { name: '全域' }).click()

  // 全域 workspace 的連線 globaldb 出現,main 消失
  await expect(page.getByRole('button', { name: 'globaldb', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'main', exact: true })).toHaveCount(0)

  // workspace 切換後查詢分頁重置為單一分頁(「查詢 2」消失)
  await expect(page.getByText('查詢 2')).toHaveCount(0)
})
