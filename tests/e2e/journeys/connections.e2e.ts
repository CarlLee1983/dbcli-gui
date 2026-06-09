import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('add → appears in list → edit → delete', async ({ page }) => {
  await page.goto(APP_PATH)

  // ── Add a new connection ──────────────────────────────────────────────────────
  await page.getByRole('button', { name: '新增連線' }).click()

  // Wait for the modal to open
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.getByLabel('連線名稱').fill('reporting')
  await page.getByLabel('主機').fill('localhost')
  await page.getByLabel('連接埠').fill('3306')
  await page.getByLabel('使用者').fill('root')
  await page.getByLabel('資料庫').fill('shop')
  await page.getByLabel('密碼').fill('pw')

  await page.getByRole('button', { name: '儲存' }).click()

  // Modal closes; new connection appears in the sidebar list
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'reporting', exact: true })).toBeVisible()

  // ── Edit the connection (hover to reveal action buttons) ─────────────────────
  // Hover the connection row to make edit/delete buttons visible
  await page.getByRole('button', { name: 'reporting', exact: true }).hover()
  await page.getByRole('button', { name: '編輯連線 reporting' }).click()

  // In edit mode, the name field is disabled
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('連線名稱')).toBeDisabled()

  // Change the host
  await page.getByLabel('主機').fill('db.internal')
  await page.getByRole('button', { name: '儲存' }).click()

  // Modal closes after save
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // ── Delete the connection ─────────────────────────────────────────────────────
  // Accept the confirm dialog
  page.on('dialog', (d) => d.accept())

  // Hover to reveal delete button
  await page.getByRole('button', { name: 'reporting', exact: true }).hover()
  await page.getByRole('button', { name: '刪除連線 reporting' }).click()

  // Connection is removed from the sidebar list
  await expect(page.getByRole('button', { name: 'reporting', exact: true })).toHaveCount(0)
})
