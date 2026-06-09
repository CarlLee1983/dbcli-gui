# Foundation E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `@playwright/test` 驅動 headless chromium,對一支 hermetic fixture sidecar + 真 React SPA 跑通四條核心使用者旅程(happy path / 匯出 / 錯誤 / 黑名單),並接上最小 GitHub Actions CI。

**Architecture:** Playwright `webServer` 啟動 `tests/e2e/serve-fixture.ts`,它在同進程組真 `createServer`(sidecar HTTP)+ `Bun.serve` SPA,只把 `ConnectionPool` 的 `openAdapter` 換成從種子資料回應的假 `DatabaseAdapter`;`port`/`token` 用固定值,讓 Playwright 的 `baseURL` 與測試的 `?port=&token=` 路徑可靜態決定。前端與 sidecar 路由(含真 `BlacklistManager`/`QueryExecutor`)全部跑真實碼,只有最底層 DB adapter 是種子。

**Tech Stack:** `@playwright/test`、既有 Bun sidecar(`createServer`/`ConnectionPool`)、`@carllee1983/dbcli/core` 型別、React 前端、GitHub Actions。

---

## File Structure

| 檔案 | 建立/修改 | 職責 |
|------|-----------|------|
| `package.json` | 修改 | +devDep `@playwright/test`、+`"e2e"` script |
| `.gitignore` | 修改 | 忽略 `test-results/`、`playwright-report/` |
| `playwright.config.ts` | 建立 | webServer / testDir / artifacts / chromium project |
| `tests/e2e/fixtures/config.ts` | 建立 | 共用常數:SPA/sidecar port、token、APP_PATH |
| `tests/e2e/fixtures/data.ts` | 建立 | 種子資料集(2 連線、tables、rows、blacklist) |
| `tests/e2e/fixtures/adapter.ts` | 建立 | 假 `DatabaseAdapter`,從種子回應 |
| `tests/e2e/serve-fixture.ts` | 建立 | 組 fixture sidecar + SPA(Playwright webServer 目標) |
| `tests/e2e/journeys/happy-path.spec.ts` | 建立 | 旅程 1 |
| `tests/e2e/journeys/export.spec.ts` | 建立 | 旅程 2 |
| `tests/e2e/journeys/errors.spec.ts` | 建立 | 旅程 3 |
| `tests/e2e/journeys/blacklist.spec.ts` | 建立 | 旅程 4 |
| `.github/workflows/ci.yml` | 建立 | 最小 CI(bun test + tsc + e2e) |
| `README.md` | 修改 | 新增 E2E 段落 |

**任務順序理由:** 先 Task 1 立 Playwright 與設定常數(最小未知);Task 2 純資料 + 假 adapter(可獨立 typecheck);Task 3 serve-fixture 並用 curl 實證 sidecar 接線;Task 4-7 各旅程逐條轉綠;Task 8 CI + README + 全驗收。**全程不需改 `src/`** —— 現有元件選擇器(`aria-label`、role、`td[data-col]`)已足夠。

---

## Task 1: 安裝 Playwright + 設定 + 常數

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `tests/e2e/fixtures/config.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: 安裝 @playwright/test 並裝 chromium**

Run:
```bash
bun add -d @playwright/test
bunx playwright install chromium
```
Expected: `package.json` devDependencies 出現 `@playwright/test`;chromium 下載完成(本機可能已 cache,秒過)。

- [ ] **Step 2: 加 `"e2e"` script**

編輯 `package.json` 的 `scripts`,在 `"tauri": "tauri"` 後加一行:
```json
    "tauri": "tauri",
    "e2e": "playwright test"
```

- [ ] **Step 3: 忽略 Playwright 產物**

在 `.gitignore` 末尾加:
```
# Playwright E2E artifacts
test-results/
playwright-report/
```

- [ ] **Step 4: 共用常數**

Create `tests/e2e/fixtures/config.ts`:
```ts
// Fixed ports/token so Playwright's baseURL and the page URL are statically known.
// Single CI job → no port-collision concern; deterministic beats random here.
export const SPA_PORT = 3210
export const SIDECAR_PORT = 3211
export const TOKEN = 'e2e-fixture-token'

/** The page URL the SPA expects: it reads ?port=&token= via readConnParams(). */
export const APP_PATH = `/?port=${SIDECAR_PORT}&token=${TOKEN}`
```

- [ ] **Step 5: Playwright 設定**

Create `playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'
import { SPA_PORT } from './tests/e2e/fixtures/config'

export default defineConfig({
  testDir: './tests/e2e/journeys',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${SPA_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run tests/e2e/serve-fixture.ts',
    url: `http://localhost:${SPA_PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
```

- [ ] **Step 6: typecheck(serve-fixture 尚未建,先確認設定/常數可編譯)**

Run:
```bash
bunx tsc --noEmit
```
Expected: 無輸出(`playwright.config.ts` 與 `config.ts` 不依賴尚未建立的檔案)。

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock .gitignore tests/e2e/fixtures/config.ts playwright.config.ts
git commit -m "test: [e2e] 安裝 @playwright/test + 設定與共用常數"
```

---

## Task 2: 種子資料 + 假 adapter

**Files:**
- Create: `tests/e2e/fixtures/data.ts`
- Create: `tests/e2e/fixtures/adapter.ts`

- [ ] **Step 1: 種子資料集**

Create `tests/e2e/fixtures/data.ts`:
```ts
import type { DbcliConfig } from '@carllee1983/dbcli/core'
import type { ConnectionSummary } from '../../../sidecar/routes/connections'

/** A column the fake adapter serves (subset of dbcli ColumnSchema). */
export interface SeedColumn {
  name: string
  type: string
  nullable: boolean
  primaryKey?: boolean
}

export interface SeedTable {
  name: string
  type: 'table' | 'view'
  columns: SeedColumn[]
  rows: Array<Record<string, unknown>>
}

export interface SeedConnection {
  summary: ConnectionSummary
  config: DbcliConfig
  tables: SeedTable[]
}

/** Substring that makes the fake adapter throw — drives the error journey. */
export const FORCE_ERROR = 'FORCE_ERROR'

export const SEED: SeedConnection[] = [
  {
    summary: { name: 'main', system: 'postgresql', isDefault: true },
    config: {
      connection: { system: 'postgresql' },
      permission: 'read-write',
      // secret_table = table-level block; users.password = column-level block.
      blacklist: { tables: ['secret_table'], columns: { users: ['password'] } },
    } as unknown as DbcliConfig,
    tables: [
      {
        name: 'orders',
        type: 'table',
        columns: [
          { name: 'id', type: 'integer', nullable: false, primaryKey: true },
          { name: 'label', type: 'text', nullable: false },
        ],
        rows: [
          { id: 1, label: 'orders-row-1' },
          { id: 2, label: 'orders-row-2' },
          { id: 3, label: 'orders-row-3' },
        ],
      },
      {
        name: 'users',
        type: 'table',
        columns: [
          { name: 'id', type: 'integer', nullable: false, primaryKey: true },
          { name: 'email', type: 'text', nullable: false },
          { name: 'password', type: 'text', nullable: false },
        ],
        rows: [
          { id: 1, email: 'a@example.com', password: 'pw1' },
          { id: 2, email: 'b@example.com', password: 'pw2' },
        ],
      },
      {
        name: 'secret_table',
        type: 'table',
        columns: [{ name: 'id', type: 'integer', nullable: false, primaryKey: true }],
        rows: [{ id: 1 }],
      },
    ],
  },
  {
    summary: { name: 'replica', system: 'mysql', isDefault: false },
    config: { connection: { system: 'mysql' }, permission: 'read-write' } as unknown as DbcliConfig,
    tables: [
      {
        name: 'metrics',
        type: 'view',
        columns: [
          { name: 'k', type: 'text', nullable: false },
          { name: 'v', type: 'integer', nullable: true },
        ],
        rows: [{ k: 'cpu', v: 42 }],
      },
    ],
  },
]
```

- [ ] **Step 2: 假 adapter**

Create `tests/e2e/fixtures/adapter.ts`:
```ts
import { ConnectionError } from '@carllee1983/dbcli/core'
import type { DatabaseAdapter, ExecutionResult, TableSchema } from '@carllee1983/dbcli/core'
import { FORCE_ERROR, type SeedTable } from './data'

/**
 * A fake DatabaseAdapter that answers from a seed dataset. The real QueryExecutor
 * derives columnNames from Object.keys(rows[0]) and applies the column blacklist via
 * filterColumns, so execute() only needs to return the right rows.
 */
export function fixtureAdapter(tables: SeedTable[]): DatabaseAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    testConnection: async () => true,
    getServerVersion: async () => 'fixture-1.0',
    listTables: async () =>
      tables.map((t) => ({
        name: t.name,
        columns: [],
        tableType: t.type,
        columnCount: t.columns.length,
        estimatedRowCount: t.rows.length,
      })) as TableSchema[],
    getTableSchema: async (name: string) => {
      const t = tables.find((tb) => tb.name === name)
      if (!t) throw new ConnectionError('TABLE_NOT_FOUND', `no such table: ${name}`, [])
      return {
        name: t.name,
        columns: t.columns.map((c) => ({ ...c })),
        primaryKey: t.columns.filter((c) => c.primaryKey).map((c) => c.name),
      } as TableSchema
    },
    execute: async (sql: string) => {
      if (sql.includes(FORCE_ERROR)) {
        throw new ConnectionError('ECONNREFUSED', 'fixture forced failure', [])
      }
      // Resolve the seed table whose name appears in the SQL; default to no rows.
      const t = tables.find((tb) => new RegExp(`\\b${tb.name}\\b`).test(sql))
      return { rows: t?.rows ?? [], affectedRows: 0 } as ExecutionResult<Record<string, unknown>>
    },
  }
}
```

- [ ] **Step 3: typecheck**

Run:
```bash
bunx tsc --noEmit
```
Expected: 無輸出(假 adapter 實作 `DatabaseAdapter` 全部方法;回傳以實際型別 cast)。

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/fixtures/data.ts tests/e2e/fixtures/adapter.ts
git commit -m "test: [e2e] 種子資料集 + 從種子回應的假 DatabaseAdapter"
```

---

## Task 3: fixture serve 腳本

**Files:**
- Create: `tests/e2e/serve-fixture.ts`

- [ ] **Step 1: serve-fixture**

Create `tests/e2e/serve-fixture.ts`:
```ts
import type { DbcliConfig } from '@carllee1983/dbcli/core'
import index from '../../src/index.html'
import { ConnectionPool } from '../../sidecar/connection-pool'
import { createServer } from '../../sidecar/server'
import { SEED } from './fixtures/data'
import { fixtureAdapter } from './fixtures/adapter'
import { SPA_PORT, SIDECAR_PORT, TOKEN } from './fixtures/config'

// loadConfig resolves by connectionId; openAdapter maps a config back to its tables.
const byName = new Map(SEED.map((s) => [s.summary.name, s]))
const tablesByConfig = new Map<DbcliConfig, typeof SEED[number]['tables']>(
  SEED.map((s) => [s.config, s.tables]),
)

const pool = new ConnectionPool({
  loadConfig: async (id: string) => {
    const seed = byName.get(id)
    if (!seed) throw new Error(`unknown fixture connection: ${id}`)
    return seed.config
  },
  openAdapter: (config: DbcliConfig) => fixtureAdapter(tablesByConfig.get(config) ?? []),
})

createServer({
  pool,
  token: TOKEN,
  port: SIDECAR_PORT,
  listConnections: async () => SEED.map((s) => s.summary),
})

Bun.serve({ port: SPA_PORT, routes: { '/': index } })

console.log(`e2e fixture up — SPA :${SPA_PORT}  sidecar :${SIDECAR_PORT}`)
```

- [ ] **Step 2: typecheck**

Run:
```bash
bunx tsc --noEmit
```
Expected: 無輸出。

- [ ] **Step 3: 手動 smoke — sidecar 接線正確**

Run(背景啟動,curl 後關閉):
```bash
bun run tests/e2e/serve-fixture.ts &
SERVE_PID=$!
sleep 1
echo "--- /connections/list ---"
curl -s -X POST -H "authorization: Bearer e2e-fixture-token" http://localhost:3211/connections/list
echo ""
echo "--- /connections/open + /schema/tree ---"
curl -s -X POST -H "authorization: Bearer e2e-fixture-token" -H "content-type: application/json" -d '{"connectionId":"main"}' http://localhost:3211/connections/open
curl -s -X POST -H "authorization: Bearer e2e-fixture-token" -H "content-type: application/json" -d '{"connectionId":"main"}' http://localhost:3211/schema/tree
echo ""
kill $SERVE_PID
```
Expected:
- `/connections/list` 回 `{"connections":[{"name":"main",...},{"name":"replica",...}]}`。
- `/connections/open` 回 `{"ok":true,"system":"postgresql"}`。
- `/schema/tree` 回含 `orders`、`users`,**不含 `secret_table`**(被 BlacklistManager 濾掉)。

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/serve-fixture.ts
git commit -m "test: [e2e] serve-fixture 組 fixture sidecar + SPA"
```

---

## Task 4: 旅程 1 — 核心 happy path

**Files:**
- Create: `tests/e2e/journeys/happy-path.spec.ts`

- [ ] **Step 1: 寫測試**

Create `tests/e2e/journeys/happy-path.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('connect → browse schema → run query → see rows', async ({ page }) => {
  await page.goto(APP_PATH)

  // connections listed in the sidebar; pick the default one
  await page.getByRole('button', { name: 'main' }).click()

  // schema tree shows the (non-blacklisted) tables
  await expect(page.getByRole('button', { name: 'orders', exact: true })).toBeVisible()

  // write SQL and run it
  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill('SELECT * FROM orders')
  await page.getByRole('button', { name: 'Run' }).click()

  // result grid renders the seeded rows
  await expect(page.locator('td[data-col="id"]').first()).toBeVisible()
  await expect(page.getByText('orders-row-1')).toBeVisible()
  await expect(page.getByText(/3 列/)).toBeVisible()
})
```

- [ ] **Step 2: 跑測試確認通過**

Run:
```bash
bun run e2e tests/e2e/journeys/happy-path.spec.ts
```
Expected: 1 passed。(Playwright 自動啟動 `serve-fixture.ts`,開 chromium,跑完關閉。)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/journeys/happy-path.spec.ts
git commit -m "test: [e2e] 旅程1 — 連線→schema→查詢→結果"
```

---

## Task 5: 旅程 2 — 匯出 CSV/JSON

**Files:**
- Create: `tests/e2e/journeys/export.spec.ts`

- [ ] **Step 1: 寫測試**

Create `tests/e2e/journeys/export.spec.ts`:
```ts
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
```

- [ ] **Step 2: 跑測試確認通過**

Run:
```bash
bun run e2e tests/e2e/journeys/export.spec.ts
```
Expected: 2 passed。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/journeys/export.spec.ts
git commit -m "test: [e2e] 旅程2 — 匯出 CSV/JSON 下載內容正確"
```

---

## Task 6: 旅程 3 — 錯誤狀態

**Files:**
- Create: `tests/e2e/journeys/errors.spec.ts`

- [ ] **Step 1: 寫測試**

Create `tests/e2e/journeys/errors.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('a failing query surfaces the error banner and the app stays usable', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main' }).click()

  // The FORCE_ERROR sentinel makes the fake adapter throw a ConnectionError.
  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill("SELECT * FROM orders WHERE label = 'FORCE_ERROR'")
  await page.getByRole('button', { name: 'Run' }).click()

  // ErrorBanner renders: its dismiss button (aria-label 關閉) is unique to the banner.
  const dismiss = page.getByRole('button', { name: '關閉' })
  await expect(dismiss).toBeVisible()
  // Tolerant text check covers both the CONNECTION and the INTERNAL friendly mappings.
  await expect(page.getByText(/連線失敗|未預期錯誤/)).toBeVisible()

  // Dismissing clears the banner — the app is still interactive.
  await dismiss.click()
  await expect(dismiss).toBeHidden()
})
```

- [ ] **Step 2: 跑測試確認通過**

Run:
```bash
bun run e2e tests/e2e/journeys/errors.spec.ts
```
Expected: 1 passed。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/journeys/errors.spec.ts
git commit -m "test: [e2e] 旅程3 — 查詢失敗顯示 ErrorBanner、可關閉"
```

---

## Task 7: 旅程 4 — 黑名單保護

**Files:**
- Create: `tests/e2e/journeys/blacklist.spec.ts`

- [ ] **Step 1: 寫測試**

Create `tests/e2e/journeys/blacklist.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('a blacklisted table is hidden from the tree and rejected on query', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main' }).click()

  // table-level: secret_table never appears in the schema tree
  await expect(page.getByRole('button', { name: 'orders', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'secret_table', exact: true })).toHaveCount(0)

  // querying it is rejected with the BLACKLISTED friendly message
  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill('SELECT * FROM secret_table')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('此表受保護，無法存取')).toBeVisible()
})

test('a blacklisted column is omitted from query results', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main' }).click()

  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill('SELECT * FROM users')
  await page.getByRole('button', { name: 'Run' }).click()

  // email is shown, but the blacklisted password column is filtered out
  await expect(page.locator('td[data-col="email"]').first()).toBeVisible()
  await expect(page.locator('th', { hasText: 'password' })).toHaveCount(0)
  await expect(page.locator('td[data-col="password"]')).toHaveCount(0)
})
```

- [ ] **Step 2: 跑測試確認通過**

Run:
```bash
bun run e2e tests/e2e/journeys/blacklist.spec.ts
```
Expected: 2 passed。

- [ ] **Step 3: 全 E2E 套件綠**

Run:
```bash
bun run e2e
```
Expected: 6 passed(happy 1 + export 2 + errors 1 + blacklist 2)。

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/journeys/blacklist.spec.ts
git commit -m "test: [e2e] 旅程4 — 黑名單表被擋、黑名單欄被濾"
```

---

## Task 8: CI + README + 最終驗收

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] **Step 1: 最小 CI**

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun test
      - run: bunx tsc --noEmit
      - run: bunx playwright install --with-deps chromium
      - run: bun run e2e
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
          if-no-files-found: ignore
```

- [ ] **Step 2: README 新增 E2E 段落**

在 `README.md` 的「桌面開發(Tauri 殼)」段落之後,加入(寫入時把 `\`\`\`` 換成真正三個反引號):
```markdown
## 端對端測試(E2E)

\`\`\`bash
bunx playwright install chromium   # 首次:裝瀏覽器
bun run e2e                         # 跑四條核心旅程
\`\`\`

E2E 用 `@playwright/test` 驅動 headless chromium,對一支 **hermetic fixture sidecar**
(注入種子資料的假 DB adapter,零外部服務)跑通:連線→schema→查詢→結果、匯出 CSV/JSON、
錯誤橫幅、黑名單保護。失敗時 `test-results/` 會留 screenshot/video/trace。

> E2E 採用 Playwright 自家 runner(非 `bun test`)以取得 webServer 自動啟動與 trace/video;
> 單元/整合測試仍全用 `bun test`。
```

- [ ] **Step 3: 單元/整合測試無回歸**

Run:
```bash
bun test
```
Expected: 122 pass / 0 fail(E2E 不在 `bun test` 範圍內,不受影響)。

- [ ] **Step 4: typecheck 綠**

Run:
```bash
bunx tsc --noEmit
```
Expected: 無輸出。

- [ ] **Step 5: E2E 全綠(最終)**

Run:
```bash
bun run e2e
```
Expected: 6 passed。

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: [e2e] 最小 GitHub Actions(bun test + tsc + e2e)+ README"
```

---

## 完成定義(對照 spec §8 驗收標準)

- [ ] `bun run e2e` 在本地 headless 跑通四條旅程、6 passed(Task 4-7)。
- [ ] happy path 出 rows、匯出檔內容正確、錯誤出 ErrorBanner、blacklist 表被擋且欄被濾(Task 4-7)。
- [ ] 失敗時 `test-results/` 有 trace/video/screenshot(`playwright.config.ts` 的 `*-on-failure`)。
- [ ] `.github/workflows/ci.yml` 跑 `bun test` + `tsc` + `bun run e2e`(Task 8 Step 1)。
- [ ] `bun test`(122)與 `tsc` 維持全綠、不受影響(Task 8 Step 3-4)。
```
