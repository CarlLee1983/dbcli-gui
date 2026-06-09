import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('schema search filters the table tree', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main', exact: true }).click()
  await expect(page.getByRole('button', { name: 'orders', exact: true })).toBeVisible()

  await page.getByRole('searchbox', { name: '搜尋資料表' }).fill('user')
  await expect(page.getByRole('button', { name: 'users', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'orders', exact: true })).toHaveCount(0)
})

test('result search filters rows and a cell opens its full value', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main', exact: true }).click()
  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill('SELECT * FROM orders')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('orders-row-1')).toBeVisible()

  await page.getByRole('searchbox', { name: '搜尋結果' }).fill('row-2')
  await expect(page.getByText('orders-row-2')).toBeVisible()
  await expect(page.getByText('orders-row-1')).toHaveCount(0)

  await page.getByText('orders-row-2').click()
  await expect(page.getByRole('dialog', { name: /label 內容/ })).toBeVisible()
})
