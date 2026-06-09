import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('schema search filters the table tree', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main' }).click()
  await expect(page.getByRole('button', { name: 'orders', exact: true })).toBeVisible()

  await page.getByRole('searchbox', { name: '搜尋資料表' }).fill('user')
  await expect(page.getByRole('button', { name: 'users', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'orders', exact: true })).toHaveCount(0)
})
