# 前端 v1.x 易用性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把單次查詢工作台升級為「可搜尋 schema、可搜尋/複製/詳閱結果、有跨連線查詢歷史、多分頁獨立 session」的前端。

**Architecture:** 純前端改動,不碰 sidecar / 後端 API。狀態從單一 `useSidecar` 拆成共用層(`useConnections`、`useHistory`)+ 每分頁 session(`useTabs`),由 `useApp` 組合。結果搜尋/排序一律客戶端對記憶體 rows。分四階段,前三階段在現行單一 session 上做,第四階段把狀態升級成 per-tab。

**Tech Stack:** Bun + React 19 + TypeScript + Tailwind v4;測試 `bun test` + happy-dom + `@testing-library/react`;E2E Playwright（hermetic fixture sidecar）。

對照設計文件:`docs/specs/2026-06-09-frontend-v1x-usability-design.md`。

---

## 檔案結構

新增:
- `src/views/tree-filter.ts` — `filterTree(tree, query)` 純函式
- `src/views/row-filter.ts` — `filterRows(rows, fields, query)` 純函式
- `src/components/CellDetailModal.tsx` — 單格完整值 modal（含複製值/複製整列）
- `src/hooks/useHistory.ts` — 歷史 hook + `addHistoryEntry` / `loadHistory` / `relativeTime` 純函式 + `HistoryEntry` 型別
- `src/views/HistoryPanel.tsx` — 歷史清單面板
- `src/hooks/tabs-reducer.ts` — `QuerySession` 型別 + `tabsReducer` + `initTabs` / `emptySession`
- `src/hooks/useConnections.ts` — 連線/schema 共用層（從 `useSidecar` 抽出）
- `src/hooks/useTabs.ts` — 分頁 session 管理 + 每分頁 `runQuery`
- `src/hooks/useApp.ts` — 組合根（取代 `useSidecar` 對外角色）
- `src/views/TabBar.tsx` — 分頁列

修改:
- `src/views/Sidebar.tsx` — 加 schema 搜尋框
- `src/views/ResultGrid.tsx` — 加結果搜尋框 + 點格開 modal（階段 2);改為受控 sort/filter（階段 4)
- `src/App.tsx` — 接 `useApp`、加 `TabBar` 與 `HistoryPanel`
- `tests/e2e/fixtures/data.ts` 不變（既有種子已足夠）

測試:
- `tests/frontend/tree-filter.test.ts`、`row-filter.test.ts`、`CellDetailModal.test.tsx`、`useHistory.test.ts`、`HistoryPanel.test.tsx`、`tabs-reducer.test.ts`、`useConnections.test.ts`、`useTabs.test.ts`
- 更新 `tests/frontend/Sidebar.test.tsx`、`tests/frontend/ResultGrid.test.tsx`
- 階段 4 移除 `tests/frontend/useSidecar.test.ts`（被 `useConnections.test.ts` + `useTabs.test.ts` 取代）
- E2E:`tests/e2e/journeys/search.e2e.ts`、`history.e2e.ts`、`tabs.e2e.ts`

每階段結束 `bun test` 與 `bunx tsc --noEmit` 全綠。

---

# 階段 1:schema 樹搜尋

### Task 1: `filterTree` 純函式

**Files:**
- Create: `src/views/tree-filter.ts`
- Test: `tests/frontend/tree-filter.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/frontend/tree-filter.test.ts
import { test, expect } from 'bun:test'
import { filterTree } from '../../src/views/tree-filter'
import type { TreeTable } from '../../src/api/types'

const tree: TreeTable[] = [
  { name: 'orders', type: 'table' },
  { name: 'order_items', type: 'table' },
  { name: 'users', type: 'table' },
  { name: 'v_active', type: 'view' },
]

test('empty query returns the whole tree', () => {
  expect(filterTree(tree, '')).toEqual(tree)
  expect(filterTree(tree, '   ')).toEqual(tree)
})

test('case-insensitive substring match on table name', () => {
  expect(filterTree(tree, 'ORDER').map((t) => t.name)).toEqual(['orders', 'order_items'])
})

test('no match returns empty array', () => {
  expect(filterTree(tree, 'zzz')).toEqual([])
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/tree-filter.test.ts`
Expected: FAIL — `filterTree` 不存在（Module not found）。

- [ ] **Step 3: 實作**

```ts
// src/views/tree-filter.ts
import type { TreeTable } from '../api/types'

/** Case-insensitive substring filter on table/view name. Empty query → all. */
export function filterTree(tree: TreeTable[], query: string): TreeTable[] {
  const q = query.trim().toLowerCase()
  if (q === '') return tree
  return tree.filter((t) => t.name.toLowerCase().includes(q))
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/tree-filter.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/views/tree-filter.ts tests/frontend/tree-filter.test.ts
git commit -m "feat: [frontend] filterTree 純函式(schema 樹過濾)"
```

### Task 2: Sidebar 接上搜尋框

**Files:**
- Modify: `src/views/Sidebar.tsx`
- Test: `tests/frontend/Sidebar.test.tsx`

- [ ] **Step 1: 加失敗測試（在現有 Sidebar.test.tsx 末尾）**

```tsx
test('typing in the schema search box filters the table list', () => {
  setup()
  fireEvent.change(screen.getByRole('textbox', { name: '搜尋資料表' }), { target: { value: 'user' } })
  expect(screen.getByText('users')).toBeDefined()
  expect(screen.queryByText('v_active')).toBeNull()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/Sidebar.test.tsx`
Expected: FAIL — 找不到 `搜尋資料表` textbox。

- [ ] **Step 3: 實作 — 在 Sidebar 的「資料表」section 頂部加搜尋框並過濾**

於 `src/views/Sidebar.tsx`:頂部 import 加上 `useState` 與 `filterTree`,
資料表 section 改為先過濾再渲染。

```tsx
// 檔頭
import { useState } from 'react'
import { Table2, Eye, Play, Database, KeyRound } from 'lucide-react'
import type { ConnectionSummary, TreeTable, TableColumnDto } from '../api/types'
import { filterTree } from './tree-filter'
```

在 `export function Sidebar(props: SidebarProps) {` 內、`return` 之前加:

```tsx
  const [tableQuery, setTableQuery] = useState('')
  const visibleTree = filterTree(props.tree, tableQuery)
```

把「資料表」section 改成（標題下方插入搜尋框,`tree.map` 改用 `visibleTree`):

```tsx
      <section className="min-h-0 flex-1 overflow-auto p-2">
        <h2 className="mb-1 px-1 text-xs font-semibold uppercase text-gray-400">資料表</h2>
        <input
          type="search"
          aria-label="搜尋資料表"
          value={tableQuery}
          onChange={(e) => setTableQuery(e.target.value)}
          placeholder="搜尋資料表…"
          className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-gray-500 focus:outline-none"
        />
        <ul>
          {visibleTree.map((t) => {
```

（其餘 `tree.map` 內部不動,僅把來源換成 `visibleTree`。原本 `const { connections, activeConnectionId, tree, expandedColumns } = props` 仍可保留,`tree` 留著給型別/相容,實際渲染用 `visibleTree`。）

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/Sidebar.test.tsx`
Expected: PASS（含新測試,原有 7 個不受影響）。

- [ ] **Step 5: typecheck + commit**

```bash
bunx tsc --noEmit
git add src/views/Sidebar.tsx tests/frontend/Sidebar.test.tsx
git commit -m "feat: [frontend] Sidebar schema 樹搜尋框"
```

### Task 3: 階段 1 E2E — schema 搜尋旅程

**Files:**
- Create: `tests/e2e/journeys/search.e2e.ts`

- [ ] **Step 1: 寫 E2E（先涵蓋 schema 搜尋,稍後同檔加結果搜尋）**

```ts
// tests/e2e/journeys/search.e2e.ts
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
```

- [ ] **Step 2: 跑 E2E 確認通過**

Run: `bun run e2e tests/e2e/journeys/search.e2e.ts`
Expected: 1 passed。（首次需先 `bunx playwright install chromium`。）

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/journeys/search.e2e.ts
git commit -m "test: [e2e] schema 搜尋旅程"
```

---

# 階段 2:結果區增強

### Task 4: `filterRows` 純函式

**Files:**
- Create: `src/views/row-filter.ts`
- Test: `tests/frontend/row-filter.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/frontend/row-filter.test.ts
import { test, expect } from 'bun:test'
import { filterRows } from '../../src/views/row-filter'

const rows = [
  { id: 1, label: 'Apple', meta: { tag: 'fruit' } },
  { id: 2, label: 'banana', meta: null },
  { id: 3, label: 'Cherry', meta: { tag: 'red' } },
]
const fields = ['id', 'label', 'meta']

test('empty query returns all rows', () => {
  expect(filterRows(rows, fields, '')).toEqual(rows)
})

test('case-insensitive substring across any field', () => {
  expect(filterRows(rows, fields, 'APP').map((r) => r.id)).toEqual([1])
})

test('matches numeric value coerced to string', () => {
  expect(filterRows(rows, fields, '2').map((r) => r.id)).toEqual([2])
})

test('matches inside JSON-stringified object cell', () => {
  expect(filterRows(rows, fields, 'red').map((r) => r.id)).toEqual([3])
})

test('null/undefined cells never match', () => {
  expect(filterRows(rows, fields, 'null')).toEqual([])
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/row-filter.test.ts`
Expected: FAIL — `filterRows` 不存在。

- [ ] **Step 3: 實作**

```ts
// src/views/row-filter.ts
/** Case-insensitive substring match against any field's rendered value. Empty query → all. */
export function filterRows<T extends Record<string, unknown>>(rows: T[], fields: string[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (q === '') return rows
  return rows.filter((row) =>
    fields.some((f) => {
      const v = row[f]
      if (v === null || v === undefined) return false
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return s.toLowerCase().includes(q)
    }),
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/row-filter.test.ts`
Expected: PASS（5 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/views/row-filter.ts tests/frontend/row-filter.test.ts
git commit -m "feat: [frontend] filterRows 純函式(結果列過濾)"
```

### Task 5: CellDetailModal 元件

**Files:**
- Create: `src/components/CellDetailModal.tsx`
- Test: `tests/frontend/CellDetailModal.test.tsx`

- [ ] **Step 1: 寫失敗測試**

```tsx
// tests/frontend/CellDetailModal.test.tsx
import { test, expect, afterEach, mock } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CellDetailModal } from '../../src/components/CellDetailModal'

afterEach(cleanup)

function setup(over: Partial<React.ComponentProps<typeof CellDetailModal>> = {}) {
  const onClose = mock(() => {})
  const writeText = mock(async () => {})
  // @ts-expect-error happy-dom navigator has no clipboard by default
  globalThis.navigator.clipboard = { writeText }
  render(
    <CellDetailModal field="label" value="orders-row-1" row={{ id: 1, label: 'orders-row-1' }} onClose={onClose} {...over} />,
  )
  return { onClose, writeText }
}

test('shows the field name and value', () => {
  setup()
  expect(screen.getByText('label')).toBeDefined()
  expect(screen.getByText('orders-row-1')).toBeDefined()
})

test('object value is pretty-printed as JSON', () => {
  setup({ value: { tag: 'fruit' } })
  expect(screen.getByText(/"tag": "fruit"/)).toBeDefined()
})

test('null value renders as NULL', () => {
  setup({ value: null })
  expect(screen.getByText('NULL')).toBeDefined()
})

test('複製值 button copies the formatted value', () => {
  const { writeText } = setup({ value: { tag: 'fruit' } })
  fireEvent.click(screen.getByRole('button', { name: '複製值' }))
  expect(writeText).toHaveBeenCalledWith('{\n  "tag": "fruit"\n}')
})

test('複製整列 button copies the row as JSON', () => {
  const { writeText } = setup()
  fireEvent.click(screen.getByRole('button', { name: '複製整列' }))
  expect(writeText).toHaveBeenCalledWith('{"id":1,"label":"orders-row-1"}')
})

test('Escape key closes the modal', () => {
  const { onClose } = setup()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})

test('clicking the close button closes the modal', () => {
  const { onClose } = setup()
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  expect(onClose).toHaveBeenCalled()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/CellDetailModal.test.tsx`
Expected: FAIL — `CellDetailModal` 不存在。

- [ ] **Step 3: 實作**

```tsx
// src/components/CellDetailModal.tsx
import { useEffect } from 'react'
import { X, Copy } from 'lucide-react'

export interface CellDetailModalProps {
  field: string
  value: unknown
  row: Record<string, unknown>
  onClose(): void
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export function CellDetailModal({ field, value, row, onClose }: CellDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const formatted = formatValue(value)
  const copy = (text: string) => { void navigator.clipboard?.writeText(text) }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${field} 內容`}
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <span className="font-medium">{field}</span>
          <button type="button" aria-label="關閉" onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </header>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-sm">{formatted}</pre>
        <footer className="flex justify-end gap-2 border-t border-gray-200 px-4 py-2">
          <button type="button" onClick={() => copy(formatted)} className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100">
            <Copy className="h-3 w-3" /> 複製值
          </button>
          <button type="button" onClick={() => copy(JSON.stringify(row))} className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100">
            <Copy className="h-3 w-3" /> 複製整列
          </button>
        </footer>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/CellDetailModal.test.tsx`
Expected: PASS（7 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/components/CellDetailModal.tsx tests/frontend/CellDetailModal.test.tsx
git commit -m "feat: [frontend] CellDetailModal(單格完整值 + 複製)"
```

### Task 6: ResultGrid 接上結果搜尋與 CellDetail

**Files:**
- Modify: `src/views/ResultGrid.tsx`
- Test: `tests/frontend/ResultGrid.test.tsx`

- [ ] **Step 1: 加失敗測試（在現有 ResultGrid.test.tsx 末尾）**

```tsx
test('result search box filters the rendered rows', () => {
  render(<ResultGrid result={{ rows: [{ id: 1, label: 'apple' }, { id: 2, label: 'banana' }], fields: ['id', 'label'], rowCount: 2, ms: 1 }} />)
  fireEvent.change(screen.getByRole('searchbox', { name: '搜尋結果' }), { target: { value: 'app' } })
  expect(screen.getByText('apple')).toBeDefined()
  expect(screen.queryByText('banana')).toBeNull()
})

test('clicking a cell opens the detail modal', () => {
  render(<ResultGrid result={{ rows: [{ id: 1, label: 'apple' }], fields: ['id', 'label'], rowCount: 1, ms: 1 }} />)
  fireEvent.click(screen.getByText('apple'))
  expect(screen.getByRole('dialog', { name: /label 內容/ })).toBeDefined()
})
```

確認 `ResultGrid.test.tsx` 檔頭已 import `fireEvent`（若無則補:`import { render, screen, fireEvent, cleanup } from '@testing-library/react'`,並保留現有 `afterEach(cleanup)`）。

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/ResultGrid.test.tsx`
Expected: FAIL — 找不到 `搜尋結果` searchbox / dialog。

- [ ] **Step 3: 實作 — ResultGrid 加本地結果搜尋 state + cell 點擊開 modal**

於 `src/views/ResultGrid.tsx`,在現有 import 後加:

```tsx
import { filterRows } from './row-filter'
import { CellDetailModal } from '../components/CellDetailModal'
```

在 component 內加 state（接在現有 `useState` 群之後）:

```tsx
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<{ field: string; value: unknown; row: Record<string, unknown> } | null>(null)
```

把 `sorted` 的計算改成「先過濾再排序」:

```tsx
  const sorted = useMemo(() => {
    if (!result) return []
    const filtered = filterRows(result.rows, result.fields, query)
    if (!sortField || !sortDir) return filtered
    return sortRows(filtered, sortField, sortDir)
  }, [result, sortField, sortDir, query])
```

在最外層 `return` 的 `<div className="flex min-h-0 flex-1 flex-col">` 內、捲動容器之前,插入搜尋列:

```tsx
      <div className="border-b border-gray-200 p-1">
        <input
          type="search"
          aria-label="搜尋結果"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setScrollTop(0) }}
          placeholder="搜尋結果…"
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-gray-500 focus:outline-none"
        />
      </div>
```

把資料格 `<td>` 改為可點擊開 modal:

```tsx
                {result.fields.map((f) => (
                  <td
                    key={f}
                    data-col={f}
                    onClick={() => setDetail({ field: f, value: row[f], row })}
                    className="cursor-pointer truncate px-3 font-mono hover:bg-blue-50"
                  >
                    {renderCell(row[f])}
                  </td>
                ))}
```

在最外層 `</div>` 之前（footer 之後）加 modal 掛載:

```tsx
      {detail ? (
        <CellDetailModal field={detail.field} value={detail.value} row={detail.row} onClose={() => setDetail(null)} />
      ) : null}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/ResultGrid.test.tsx`
Expected: PASS（含 2 個新測試 + 原有測試）。

- [ ] **Step 5: typecheck + commit**

```bash
bunx tsc --noEmit
git add src/views/ResultGrid.tsx tests/frontend/ResultGrid.test.tsx
git commit -m "feat: [frontend] ResultGrid 結果搜尋 + 點格看完整值"
```

### Task 7: 階段 2 E2E — 結果搜尋 + CellDetail

**Files:**
- Modify: `tests/e2e/journeys/search.e2e.ts`

- [ ] **Step 1: 在 search.e2e.ts 加旅程**

```ts
test('result search filters rows and a cell opens its full value', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main' }).click()
  await page.getByRole('textbox', { name: 'SQL 查詢' }).fill('SELECT * FROM orders')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('orders-row-1')).toBeVisible()

  await page.getByRole('searchbox', { name: '搜尋結果' }).fill('row-2')
  await expect(page.getByText('orders-row-2')).toBeVisible()
  await expect(page.getByText('orders-row-1')).toHaveCount(0)

  await page.getByText('orders-row-2').click()
  await expect(page.getByRole('dialog', { name: /label 內容/ })).toBeVisible()
})
```

- [ ] **Step 2: 跑 E2E 確認通過**

Run: `bun run e2e tests/e2e/journeys/search.e2e.ts`
Expected: 2 passed。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/journeys/search.e2e.ts
git commit -m "test: [e2e] 結果搜尋 + CellDetail 旅程"
```

---

# 階段 3:查詢歷史

### Task 8: `useHistory` hook 與純函式

**Files:**
- Create: `src/hooks/useHistory.ts`
- Test: `tests/frontend/useHistory.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/frontend/useHistory.test.ts
import { test, expect, beforeEach } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import { useHistory, addHistoryEntry, loadHistory, relativeTime, type HistoryEntry } from '../../src/hooks/useHistory'

const entry = (sql: string, ts = 1000): HistoryEntry => ({ sql, connectionId: 'main', ts, rowCount: 1 })

beforeEach(() => { localStorage.clear() })

test('addHistoryEntry prepends and dedupes by sql+connectionId', () => {
  const a = addHistoryEntry([], entry('SELECT 1'))
  const b = addHistoryEntry(a, entry('SELECT 2'))
  const c = addHistoryEntry(b, entry('SELECT 1', 2000)) // duplicate sql, moves to top with new ts
  expect(c.map((e) => e.sql)).toEqual(['SELECT 1', 'SELECT 2'])
  expect(c[0].ts).toBe(2000)
})

test('addHistoryEntry caps at 100 entries', () => {
  let list: HistoryEntry[] = []
  for (let i = 0; i < 120; i++) list = addHistoryEntry(list, entry(`SELECT ${i}`))
  expect(list.length).toBe(100)
  expect(list[0].sql).toBe('SELECT 119')
})

test('loadHistory returns [] on missing or corrupt storage', () => {
  expect(loadHistory()).toEqual([])
  localStorage.setItem('dbcli-gui:history', '{not json')
  expect(loadHistory()).toEqual([])
})

test('relativeTime formats seconds/minutes/hours ago', () => {
  const now = 1_000_000
  expect(relativeTime(now - 5_000, now)).toBe('5 秒前')
  expect(relativeTime(now - 120_000, now)).toBe('2 分前')
  expect(relativeTime(now - 7_200_000, now)).toBe('2 小時前')
})

test('useHistory.add persists to localStorage', () => {
  const { result } = renderHook(() => useHistory())
  act(() => { result.current.add(entry('SELECT 9')) })
  expect(result.current.entries[0].sql).toBe('SELECT 9')
  expect(JSON.parse(localStorage.getItem('dbcli-gui:history')!)[0].sql).toBe('SELECT 9')
})

test('useHistory.clear empties entries and storage', () => {
  const { result } = renderHook(() => useHistory())
  act(() => { result.current.add(entry('SELECT 9')) })
  act(() => { result.current.clear() })
  expect(result.current.entries).toEqual([])
  expect(localStorage.getItem('dbcli-gui:history')).toBeNull()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/useHistory.test.ts`
Expected: FAIL — module 不存在。

- [ ] **Step 3: 實作**

```ts
// src/hooks/useHistory.ts
import { useCallback, useState } from 'react'

export interface HistoryEntry {
  sql: string
  connectionId: string | null
  ts: number
  rowCount: number
}

const KEY = 'dbcli-gui:history'
const CAP = 100

/** Prepend, dedupe by sql+connectionId (newest wins), cap to CAP. Returns a NEW array. */
export function addHistoryEntry(list: HistoryEntry[], entry: HistoryEntry, cap = CAP): HistoryEntry[] {
  const deduped = list.filter((e) => !(e.sql === entry.sql && e.connectionId === entry.connectionId))
  return [entry, ...deduped].slice(0, cap)
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : []
  } catch {
    return []
  }
}

/** Coarse relative time in Traditional Chinese. */
export function relativeTime(ts: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - ts) / 1000))
  if (sec < 60) return `${sec} 秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小時前`
  return `${Math.floor(hr / 24)} 天前`
}

export interface HistoryApi {
  entries: HistoryEntry[]
  add(entry: HistoryEntry): void
  clear(): void
}

export function useHistory(): HistoryApi {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory())

  const add = useCallback((entry: HistoryEntry) => {
    setEntries((prev) => {
      const next = addHistoryEntry(prev, entry)
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage full/unavailable */ }
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setEntries([])
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  }, [])

  return { entries, add, clear }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/useHistory.test.ts`
Expected: PASS（6 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useHistory.ts tests/frontend/useHistory.test.ts
git commit -m "feat: [frontend] useHistory(localStorage 去重/上限/相對時間)"
```

### Task 9: HistoryPanel 元件

**Files:**
- Create: `src/views/HistoryPanel.tsx`
- Test: `tests/frontend/HistoryPanel.test.tsx`

- [ ] **Step 1: 寫失敗測試**

```tsx
// tests/frontend/HistoryPanel.test.tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HistoryPanel } from '../../src/views/HistoryPanel'
import type { HistoryEntry } from '../../src/hooks/useHistory'

afterEach(cleanup)

const entries: HistoryEntry[] = [
  { sql: 'SELECT * FROM orders', connectionId: 'main', ts: 1000, rowCount: 3 },
  { sql: 'SELECT * FROM users', connectionId: 'replica', ts: 500, rowCount: 2 },
]

function setup() {
  const picks: string[] = []
  let cleared = 0
  render(<HistoryPanel entries={entries} now={2000} onPick={(sql) => picks.push(sql)} onClear={() => { cleared++ }} />)
  return { picks, getCleared: () => cleared }
}

test('renders each entry with its connection tag', () => {
  setup()
  expect(screen.getByText('SELECT * FROM orders')).toBeDefined()
  expect(screen.getByText('main')).toBeDefined()
  expect(screen.getByText('replica')).toBeDefined()
})

test('clicking an entry calls onPick with its sql', () => {
  const { picks } = setup()
  fireEvent.click(screen.getByText('SELECT * FROM users'))
  expect(picks).toEqual(['SELECT * FROM users'])
})

test('empty state when no entries', () => {
  render(<HistoryPanel entries={[]} now={0} onPick={() => {}} onClear={() => {}} />)
  expect(screen.getByText('尚無查詢歷史')).toBeDefined()
})

test('clear button calls onClear', () => {
  const { getCleared } = setup()
  fireEvent.click(screen.getByRole('button', { name: '清除歷史' }))
  expect(getCleared()).toBe(1)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/HistoryPanel.test.tsx`
Expected: FAIL — module 不存在。

- [ ] **Step 3: 實作**

```tsx
// src/views/HistoryPanel.tsx
import { History, Trash2 } from 'lucide-react'
import { relativeTime, type HistoryEntry } from '../hooks/useHistory'

export interface HistoryPanelProps {
  entries: HistoryEntry[]
  now: number
  onPick(sql: string): void
  onClear(): void
}

export function HistoryPanel({ entries, now, onPick, onClear }: HistoryPanelProps) {
  return (
    <aside aria-label="查詢歷史" className="flex w-72 flex-col border-l border-gray-200 bg-gray-50 text-sm">
      <header className="flex items-center justify-between border-b border-gray-200 p-2">
        <h2 className="flex items-center gap-1 text-xs font-semibold uppercase text-gray-400">
          <History className="h-3 w-3" /> 查詢歷史
        </h2>
        <button type="button" aria-label="清除歷史" onClick={onClear} className="rounded p-1 hover:bg-gray-200" disabled={entries.length === 0}>
          <Trash2 className="h-3 w-3" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {entries.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-gray-400">尚無查詢歷史</p>
        ) : (
          <ul>
            {entries.map((e) => (
              <li key={`${e.connectionId}:${e.ts}`}>
                <button
                  type="button"
                  onClick={() => onPick(e.sql)}
                  className="flex w-full flex-col gap-0.5 rounded px-2 py-1 text-left hover:bg-gray-200"
                >
                  <span className="truncate font-mono text-xs">{e.sql}</span>
                  <span className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span>{e.connectionId ?? '—'}</span>
                    <span>· {e.rowCount} 列</span>
                    <span>· {relativeTime(e.ts, now)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/HistoryPanel.test.tsx`
Expected: PASS（4 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/views/HistoryPanel.tsx tests/frontend/HistoryPanel.test.tsx
git commit -m "feat: [frontend] HistoryPanel(點擊回填 SQL)"
```

### Task 10: useSidecar 記錄歷史 + App 掛 HistoryPanel

> 階段 3 仍在現行單一 session。把 `useHistory` 組進 `useSidecar`,`runQuery` 成功時記錄;`App` 渲染 `HistoryPanel`,點擊回填 `sql`。階段 4 會把這段搬進 `useTabs`。

**Files:**
- Modify: `src/hooks/useSidecar.ts`
- Modify: `src/App.tsx`
- Test: `tests/frontend/useSidecar.test.ts`

- [ ] **Step 1: 加失敗測試（useSidecar.test.ts 末尾）**

```ts
import { beforeEach } from 'bun:test'

beforeEach(() => { localStorage.clear() })

test('successful runQuery records a history entry tagged with the connection', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  await act(async () => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.runQuery() })
  expect(result.current.history.entries[0]?.sql).toBe('SELECT 1')
  expect(result.current.history.entries[0]?.connectionId).toBe('a')
})

test('loadFromHistory fills the editor with the given sql', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  act(() => { result.current.loadFromHistory('SELECT 42') })
  expect(result.current.sql).toBe('SELECT 42')
})
```

> 注意:把檔頭 `import { test, expect } from 'bun:test'` 補上 `beforeEach`,
> 或在現有 import 行加入。`localStorage` 由 happy-dom 提供。

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/useSidecar.test.ts`
Expected: FAIL — `result.current.history` / `loadFromHistory` 不存在。

- [ ] **Step 3: 實作 — useSidecar 整合 useHistory**

於 `src/hooks/useSidecar.ts`:

檔頭 import 加:
```ts
import { useHistory, type HistoryApi } from './useHistory'
```

`SidecarApi` interface 加兩個成員:
```ts
  history: HistoryApi
  loadFromHistory(sql: string): void
```

在 `useSidecar` body 內、其他 hook 呼叫處加:
```ts
  const history = useHistory()
```

`runQuery` 成功路徑(`setResult(res)` 之後)加記錄:
```ts
      setResult(res)
      history.add({ sql: currentSql, connectionId: connId, ts: Date.now(), rowCount: res.rowCount })
```

加一個 action:
```ts
  const loadFromHistory = useCallback((value: string) => setSql(value), [])
```

`return` 物件加上 `history, loadFromHistory`。

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/useSidecar.test.ts`
Expected: PASS（含 2 新測試 + 原有 11 個）。

- [ ] **Step 5: App 掛上 HistoryPanel**

於 `src/App.tsx`:import 加 `import { HistoryPanel } from './views/HistoryPanel'`。
在最外層 `online` 分支的主畫面,`<main>` 之後（與 Sidebar 對稱、放右側）加:

```tsx
        <HistoryPanel
          entries={s.history.entries}
          now={Date.now()}
          onPick={s.loadFromHistory}
          onClear={s.history.clear}
        />
```

即 `<div className="flex min-h-0 flex-1">` 內順序為:`Sidebar` → `main` → `HistoryPanel`。

- [ ] **Step 6: 全套測試 + typecheck + commit**

```bash
bun test
bunx tsc --noEmit
git add src/hooks/useSidecar.ts src/App.tsx tests/frontend/useSidecar.test.ts
git commit -m "feat: [frontend] 查詢歷史接上 runQuery + App 掛 HistoryPanel"
```

### Task 11: 階段 3 E2E — 歷史記錄與回填

**Files:**
- Create: `tests/e2e/journeys/history.e2e.ts`

- [ ] **Step 1: 寫 E2E**

```ts
// tests/e2e/journeys/history.e2e.ts
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('running a query records it in history and clicking reloads the SQL', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main' }).click()
  const editor = page.getByRole('textbox', { name: 'SQL 查詢' })
  await editor.fill('SELECT * FROM orders')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('orders-row-1')).toBeVisible()

  // history panel shows the query（HistoryPanel 的 <aside aria-label="查詢歷史">）
  const historyPanel = page.getByRole('complementary', { name: '查詢歷史' })
  await expect(historyPanel.getByText('SELECT * FROM orders')).toBeVisible()

  // change the editor, then click history to reload
  await editor.fill('SELECT 1')
  await historyPanel.getByText('SELECT * FROM orders').click()
  await expect(editor).toHaveValue('SELECT * FROM orders')
})
```

- [ ] **Step 2: 跑 E2E 確認通過**

Run: `bun run e2e tests/e2e/journeys/history.e2e.ts`
Expected: 1 passed。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/journeys/history.e2e.ts
git commit -m "test: [e2e] 查詢歷史記錄與回填旅程"
```

---

# 階段 4:多查詢分頁（狀態重塑）

> 把單一 session 升級成 per-tab。新增 `tabs-reducer`、`useConnections`、`useTabs`、`useApp`、`TabBar`,
> `App.tsx` 改接 `useApp`,`ResultGrid` 的 sort/filter 改為受控（隨分頁切換保留）。
> 移除 `useSidecar`(及其測試),由 `useConnections` + `useTabs` 取代。

### Task 12: `tabs-reducer` 純模組

**Files:**
- Create: `src/hooks/tabs-reducer.ts`
- Test: `tests/frontend/tabs-reducer.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/frontend/tabs-reducer.test.ts
import { test, expect } from 'bun:test'
import { tabsReducer, initTabs } from '../../src/hooks/tabs-reducer'

test('initTabs has one empty active session', () => {
  const s = initTabs()
  expect(s.sessions.length).toBe(1)
  expect(s.activeId).toBe(s.sessions[0].id)
  expect(s.sessions[0].sql).toBe('')
})

test('open appends a new session and makes it active', () => {
  const s = tabsReducer(initTabs(), { type: 'open' })
  expect(s.sessions.length).toBe(2)
  expect(s.activeId).toBe(s.sessions[1].id)
})

test('patch updates only the targeted session', () => {
  let s = tabsReducer(initTabs(), { type: 'open' })
  const firstId = s.sessions[0].id
  s = tabsReducer(s, { type: 'patch', id: firstId, patch: { sql: 'SELECT 1' } })
  expect(s.sessions[0].sql).toBe('SELECT 1')
  expect(s.sessions[1].sql).toBe('')
})

test('closing the active tab moves active to a neighbor', () => {
  let s = tabsReducer(initTabs(), { type: 'open' }) // 2 tabs, active = 2nd
  const secondId = s.activeId
  s = tabsReducer(s, { type: 'close', id: secondId })
  expect(s.sessions.length).toBe(1)
  expect(s.activeId).toBe(s.sessions[0].id)
})

test('closing the last tab leaves one fresh empty tab', () => {
  let s = initTabs()
  s = tabsReducer(s, { type: 'close', id: s.activeId })
  expect(s.sessions.length).toBe(1)
  expect(s.sessions[0].sql).toBe('')
  expect(s.activeId).toBe(s.sessions[0].id)
})

test('rename changes only the title', () => {
  let s = initTabs()
  s = tabsReducer(s, { type: 'rename', id: s.activeId, title: '報表' })
  expect(s.sessions[0].title).toBe('報表')
})

test('setActive switches the active id', () => {
  let s = tabsReducer(initTabs(), { type: 'open' })
  const firstId = s.sessions[0].id
  s = tabsReducer(s, { type: 'setActive', id: firstId })
  expect(s.activeId).toBe(firstId)
})

test('ids are unique across open/close churn', () => {
  let s = initTabs()
  const ids = new Set([s.sessions[0].id])
  for (let i = 0; i < 5; i++) { s = tabsReducer(s, { type: 'open' }); ids.add(s.activeId) }
  expect(ids.size).toBe(6)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/tabs-reducer.test.ts`
Expected: FAIL — module 不存在。

- [ ] **Step 3: 實作**

```ts
// src/hooks/tabs-reducer.ts
import type { QueryResultDto } from '../api/types'
import type { SortDir } from '../views/grid-virtual'
import type { ApiError } from '../api/client'

export interface QuerySession {
  id: string
  title: string
  sql: string
  result: QueryResultDto | null
  sortField: string | null
  sortDir: SortDir
  resultFilter: string
  loading: boolean
  error: ApiError | null
}

export interface TabsState {
  sessions: QuerySession[]
  activeId: string
  seq: number
}

export function emptySession(seq: number): QuerySession {
  return {
    id: `tab-${seq}`,
    title: `查詢 ${seq}`,
    sql: '',
    result: null,
    sortField: null,
    sortDir: null,
    resultFilter: '',
    loading: false,
    error: null,
  }
}

export function initTabs(): TabsState {
  const first = emptySession(1)
  return { sessions: [first], activeId: first.id, seq: 1 }
}

export type TabsAction =
  | { type: 'open' }
  | { type: 'close'; id: string }
  | { type: 'rename'; id: string; title: string }
  | { type: 'setActive'; id: string }
  | { type: 'patch'; id: string; patch: Partial<QuerySession> }

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      const seq = state.seq + 1
      const s = emptySession(seq)
      return { sessions: [...state.sessions, s], activeId: s.id, seq }
    }
    case 'close': {
      const idx = state.sessions.findIndex((s) => s.id === action.id)
      if (idx === -1) return state
      const remaining = state.sessions.filter((s) => s.id !== action.id)
      if (remaining.length === 0) {
        const seq = state.seq + 1
        const s = emptySession(seq)
        return { sessions: [s], activeId: s.id, seq }
      }
      let activeId = state.activeId
      if (action.id === state.activeId) {
        activeId = remaining[Math.min(idx, remaining.length - 1)].id
      }
      return { ...state, sessions: remaining, activeId }
    }
    case 'rename':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, title: action.title } : s)) }
    case 'setActive':
      return state.sessions.some((s) => s.id === action.id) ? { ...state, activeId: action.id } : state
    case 'patch':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) }
    default:
      return state
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/tabs-reducer.test.ts`
Expected: PASS（8 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/hooks/tabs-reducer.ts tests/frontend/tabs-reducer.test.ts
git commit -m "feat: [frontend] tabsReducer(分頁 session 狀態)"
```

### Task 13: `useConnections`（從 useSidecar 抽出連線/schema 共用層）

**Files:**
- Create: `src/hooks/useConnections.ts`
- Test: `tests/frontend/useConnections.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/frontend/useConnections.test.ts
import { test, expect } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useConnections } from '../../src/hooks/useConnections'
import type { DbClient } from '../../src/api/client'

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    health: async () => ({ ok: true, version: '0.1.0' }),
    listConnections: async () => ({ connections: [{ name: 'a', system: 'postgresql', isDefault: true }] }),
    openConnection: async () => ({ ok: true, system: 'postgresql' }),
    closeConnection: async () => ({ ok: true }),
    query: async () => ({ rows: [], fields: [], rowCount: 0, ms: 1 }),
    schemaTree: async () => ({ tables: [{ name: 't', type: 'table' }] }),
    schemaTable: async () => ({ name: 't', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }] }),
    exportRows: async () => {},
    ...over,
  }
}

test('on mount checks health and loads connections', async () => {
  const { result } = renderHook(() => useConnections(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await waitFor(() => expect(result.current.connections.length).toBe(1))
})

test('selectConnection opens it and loads the schema tree', async () => {
  const { result } = renderHook(() => useConnections(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  expect(result.current.activeConnectionId).toBe('a')
  expect(result.current.tree.length).toBe(1)
})

test('loadTableColumns populates expandedColumns', async () => {
  const { result } = renderHook(() => useConnections(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  await act(async () => { await result.current.loadTableColumns('t') })
  expect(result.current.expandedColumns['t']?.[0]?.name).toBe('id')
})

test('health failure marks offline', async () => {
  const { result } = renderHook(() => useConnections(fakeClient({ health: async () => { throw new Error('down') } })))
  await waitFor(() => expect(result.current.online).toBe(false))
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/useConnections.test.ts`
Expected: FAIL — module 不存在。

- [ ] **Step 3: 實作 — 把 useSidecar 的連線/schema 部分搬出**

```ts
// src/hooks/useConnections.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { client as defaultClient, ApiError, type DbClient } from '../api/client'
import type { ConnectionSummary, TreeTable, TableColumnDto } from '../api/types'

const INTERNAL_STATUS = 0
export const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError('INTERNAL', err instanceof Error ? err.message : 'Unknown error', INTERNAL_STATUS)

export interface ConnectionsApi {
  online: boolean
  connections: ConnectionSummary[]
  activeConnectionId: string | null
  tree: TreeTable[]
  expandedColumns: Record<string, TableColumnDto[]>
  error: ApiError | null
  client: DbClient
  selectConnection(id: string): Promise<void>
  loadTableColumns(table: string): Promise<void>
  refreshConnections(): Promise<void>
  setError(err: ApiError | null): void
  dismissError(): void
}

export function useConnections(client: DbClient = defaultClient): ConnectionsApi {
  const clientRef = useRef(client)
  clientRef.current = client

  const [online, setOnline] = useState(false)
  const [connections, setConnections] = useState<ConnectionSummary[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeTable[]>([])
  const [expandedColumns, setExpandedColumns] = useState<Record<string, TableColumnDto[]>>({})
  const [error, setError] = useState<ApiError | null>(null)

  const refreshConnections = useCallback(async () => {
    try {
      const { connections } = await clientRef.current.listConnections()
      setConnections(connections)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await clientRef.current.health()
        if (cancelled) return
        setOnline(true)
        await refreshConnections()
      } catch {
        if (!cancelled) setOnline(false)
      }
    })()
    return () => { cancelled = true }
  }, [refreshConnections])

  const selectConnection = useCallback(async (id: string) => {
    setError(null)
    try {
      await clientRef.current.openConnection(id)
      const { tables } = await clientRef.current.schemaTree(id)
      setActiveConnectionId(id)
      setExpandedColumns({})
      setTree(tables)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [])

  const loadTableColumns = useCallback(async (table: string) => {
    const connId = activeConnectionId
    if (!connId) return
    try {
      const schema = await clientRef.current.schemaTable(connId, table)
      setExpandedColumns((prev) => ({ ...prev, [table]: schema.columns }))
    } catch (err) {
      setError(toApiError(err))
    }
  }, [activeConnectionId])

  const dismissError = useCallback(() => setError(null), [])

  return {
    online, connections, activeConnectionId, tree, expandedColumns, error, client: clientRef.current,
    selectConnection, loadTableColumns, refreshConnections, setError, dismissError,
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/useConnections.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useConnections.ts tests/frontend/useConnections.test.ts
git commit -m "feat: [frontend] useConnections(連線/schema 共用層)"
```

### Task 14: `useTabs`（每分頁 session + runQuery）

**Files:**
- Create: `src/hooks/useTabs.ts`
- Test: `tests/frontend/useTabs.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/frontend/useTabs.test.ts
import { test, expect, beforeEach } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTabs } from '../../src/hooks/useTabs'
import { ApiError, type DbClient } from '../../src/api/client'
import type { HistoryEntry } from '../../src/hooks/useHistory'

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    health: async () => ({ ok: true, version: '0.1.0' }),
    listConnections: async () => ({ connections: [] }),
    openConnection: async () => ({ ok: true, system: 'postgresql' }),
    closeConnection: async () => ({ ok: true }),
    query: async () => ({ rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 2 }),
    schemaTree: async () => ({ tables: [] }),
    schemaTable: async () => ({ name: 't', columns: [] }),
    exportRows: async () => {},
    ...over,
  }
}

function harness(over: Partial<DbClient> = {}, connId: string | null = 'a') {
  const recorded: HistoryEntry[] = []
  const { result } = renderHook(() => useTabs({ client: fakeClient(over), activeConnectionId: connId, onRecord: (e) => recorded.push(e) }))
  return { result, recorded }
}

beforeEach(() => { localStorage.clear() })

test('setSql updates the active session only', () => {
  const { result } = harness()
  act(() => { result.current.openTab() })
  act(() => { result.current.setSql('SELECT 1') })
  expect(result.current.active.sql).toBe('SELECT 1')
  expect(result.current.sessions[0].sql).toBe('')
})

test('runQuery stores result on the active session and records history', async () => {
  const { result, recorded } = harness()
  act(() => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.runQuery() })
  expect(result.current.active.result?.rowCount).toBe(1)
  expect(recorded[0]?.sql).toBe('SELECT 1')
  expect(recorded[0]?.connectionId).toBe('a')
})

test('runQuery on one tab does not affect another', async () => {
  const { result } = harness()
  act(() => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.runQuery() })
  act(() => { result.current.openTab() })
  expect(result.current.active.result).toBeNull()
  expect(result.current.sessions[0].result?.rowCount).toBe(1)
})

test('runQuery retries once after NOT_OPEN', async () => {
  let calls = 0
  const { result } = harness({
    query: async () => { calls++; if (calls === 1) throw new ApiError('NOT_OPEN', 'x', 409); return { rows: [], fields: [], rowCount: 0, ms: 1 } },
  })
  act(() => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.runQuery() })
  expect(calls).toBe(2)
  expect(result.current.active.error).toBeNull()
})

test('runQuery surfaces a non-retryable error on the active session', async () => {
  const { result } = harness({ query: async () => { throw new ApiError('PERMISSION', 'ro', 403) } })
  act(() => { result.current.setSql('DELETE FROM t') })
  await act(async () => { await result.current.runQuery() })
  expect(result.current.active.error?.code).toBe('PERMISSION')
})

test('loadSql fills the active session sql', () => {
  const { result } = harness()
  act(() => { result.current.loadSql('SELECT 42') })
  expect(result.current.active.sql).toBe('SELECT 42')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/useTabs.test.ts`
Expected: FAIL — module 不存在。

- [ ] **Step 3: 實作**

```ts
// src/hooks/useTabs.ts
import { useCallback, useReducer, useRef } from 'react'
import { ApiError, type DbClient } from '../api/client'
import type { SortDir } from '../views/grid-virtual'
import { toApiError } from './useConnections'
import type { HistoryEntry } from './useHistory'
import { tabsReducer, initTabs, type QuerySession } from './tabs-reducer'

export interface UseTabsOpts {
  client: DbClient
  activeConnectionId: string | null
  onRecord(entry: HistoryEntry): void
}

export interface TabsApi {
  sessions: QuerySession[]
  activeId: string
  active: QuerySession
  openTab(): void
  closeTab(id: string): void
  renameTab(id: string, title: string): void
  setActive(id: string): void
  setSql(sql: string): void
  loadSql(sql: string): void
  setSort(field: string | null, dir: SortDir): void
  setResultFilter(filter: string): void
  runQuery(): Promise<void>
  dismissError(): void
}

export function useTabs(opts: UseTabsOpts): TabsApi {
  const [state, dispatch] = useReducer(tabsReducer, undefined, initTabs)
  const stateRef = useRef(state)
  stateRef.current = state
  const optsRef = useRef(opts)
  optsRef.current = opts

  const active = state.sessions.find((s) => s.id === state.activeId) ?? state.sessions[0]

  const patchActive = useCallback((patch: Partial<QuerySession>) => {
    dispatch({ type: 'patch', id: stateRef.current.activeId, patch })
  }, [])

  const setSql = useCallback((sql: string) => patchActive({ sql }), [patchActive])
  const loadSql = useCallback((sql: string) => patchActive({ sql }), [patchActive])
  const setSort = useCallback((sortField: string | null, sortDir: SortDir) => patchActive({ sortField, sortDir }), [patchActive])
  const setResultFilter = useCallback((resultFilter: string) => patchActive({ resultFilter }), [patchActive])
  const dismissError = useCallback(() => patchActive({ error: null }), [patchActive])

  const openTab = useCallback(() => dispatch({ type: 'open' }), [])
  const closeTab = useCallback((id: string) => dispatch({ type: 'close', id }), [])
  const renameTab = useCallback((id: string, title: string) => dispatch({ type: 'rename', id, title }), [])
  const setActive = useCallback((id: string) => dispatch({ type: 'setActive', id }), [])

  const runQuery = useCallback(async () => {
    const { client, activeConnectionId, onRecord } = optsRef.current
    const id = stateRef.current.activeId
    const session = stateRef.current.sessions.find((s) => s.id === id)
    const connId = activeConnectionId
    const sql = session?.sql ?? ''
    if (!connId || sql.trim() === '') return
    dispatch({ type: 'patch', id, patch: { loading: true, error: null } })
    try {
      let res
      try {
        res = await client.query(connId, sql)
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NOT_OPEN') {
          await client.openConnection(connId)
          res = await client.query(connId, sql)
        } else {
          throw err
        }
      }
      dispatch({ type: 'patch', id, patch: { result: res, loading: false } })
      onRecord({ sql, connectionId: connId, ts: Date.now(), rowCount: res.rowCount })
    } catch (err) {
      dispatch({ type: 'patch', id, patch: { error: toApiError(err), loading: false } })
    }
  }, [])

  return {
    sessions: state.sessions, activeId: state.activeId, active,
    openTab, closeTab, renameTab, setActive,
    setSql, loadSql, setSort, setResultFilter, runQuery, dismissError,
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/useTabs.test.ts`
Expected: PASS（6 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTabs.ts tests/frontend/useTabs.test.ts
git commit -m "feat: [frontend] useTabs(每分頁 runQuery 與 session 操作)"
```

### Task 15: `useApp` 組合根

**Files:**
- Create: `src/hooks/useApp.ts`
- Test: `tests/frontend/useApp.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/frontend/useApp.test.ts
import { test, expect, beforeEach } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApp } from '../../src/hooks/useApp'
import type { DbClient } from '../../src/api/client'

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    health: async () => ({ ok: true, version: '0.1.0' }),
    listConnections: async () => ({ connections: [{ name: 'a', system: 'postgresql', isDefault: true }] }),
    openConnection: async () => ({ ok: true, system: 'postgresql' }),
    closeConnection: async () => ({ ok: true }),
    query: async () => ({ rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 2 }),
    schemaTree: async () => ({ tables: [{ name: 't', type: 'table' }] }),
    schemaTable: async () => ({ name: 't', columns: [] }),
    exportRows: async () => {},
    ...over,
  }
}

beforeEach(() => { localStorage.clear() })

test('runQuery records into shared history across the active tab', async () => {
  const { result } = renderHook(() => useApp(fakeClient()))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  act(() => { result.current.tabs.setSql('SELECT 1') })
  await act(async () => { await result.current.tabs.runQuery() })
  expect(result.current.history.entries[0]?.sql).toBe('SELECT 1')
})

test('exportResult forwards active connection + active sql + format', async () => {
  const calls: Array<[string, string, string]> = []
  const { result } = renderHook(() => useApp(fakeClient({ exportRows: async (id, sql, fmt) => { calls.push([id, sql, fmt]) } })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  act(() => { result.current.tabs.setSql('SELECT 1') })
  await act(async () => { await result.current.exportResult('csv') })
  expect(calls).toEqual([['a', 'SELECT 1', 'csv']])
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/useApp.test.ts`
Expected: FAIL — module 不存在。

- [ ] **Step 3: 實作**

```ts
// src/hooks/useApp.ts
import { useCallback } from 'react'
import { client as defaultClient, type DbClient } from '../api/client'
import { useConnections, toApiError, type ConnectionsApi } from './useConnections'
import { useHistory, type HistoryApi } from './useHistory'
import { useTabs, type TabsApi } from './useTabs'

export interface AppApi {
  connections: ConnectionsApi
  history: HistoryApi
  tabs: TabsApi
  exportResult(format: 'csv' | 'json'): Promise<void>
}

export function useApp(client: DbClient = defaultClient): AppApi {
  const connections = useConnections(client)
  const history = useHistory()
  const tabs = useTabs({ client: connections.client, activeConnectionId: connections.activeConnectionId, onRecord: history.add })

  const exportResult = useCallback(async (format: 'csv' | 'json') => {
    const connId = connections.activeConnectionId
    const sql = tabs.active.sql
    if (!connId || sql.trim() === '') return
    try {
      await connections.client.exportRows(connId, sql, format)
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs.active.sql])

  return { connections, history, tabs, exportResult }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/useApp.test.ts`
Expected: PASS（2 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useApp.ts tests/frontend/useApp.test.ts
git commit -m "feat: [frontend] useApp 組合根(連線+歷史+分頁+匯出)"
```

### Task 16: TabBar 元件

**Files:**
- Create: `src/views/TabBar.tsx`
- Test: `tests/frontend/TabBar.test.tsx`

- [ ] **Step 1: 寫失敗測試**

```tsx
// tests/frontend/TabBar.test.tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TabBar } from '../../src/views/TabBar'
import { emptySession } from '../../src/hooks/tabs-reducer'

afterEach(cleanup)

const sessions = [
  { ...emptySession(1), title: '查詢 1' },
  { ...emptySession(2), title: '查詢 2' },
]

function setup() {
  const calls = { open: 0, close: [] as string[], active: [] as string[], rename: [] as Array<[string, string]> }
  render(
    <TabBar
      sessions={sessions}
      activeId="tab-1"
      onOpen={() => { calls.open++ }}
      onClose={(id) => calls.close.push(id)}
      onSetActive={(id) => calls.active.push(id)}
      onRename={(id, t) => calls.rename.push([id, t])}
    />,
  )
  return calls
}

test('renders a tab per session', () => {
  setup()
  expect(screen.getByText('查詢 1')).toBeDefined()
  expect(screen.getByText('查詢 2')).toBeDefined()
})

test('clicking a tab sets it active', () => {
  const calls = setup()
  fireEvent.click(screen.getByText('查詢 2'))
  expect(calls.active).toEqual(['tab-2'])
})

test('the + button opens a new tab', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: '開新分頁' }))
  expect(calls.open).toBe(1)
})

test('close button closes the tab', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: '關閉 查詢 2' }))
  expect(calls.close).toEqual(['tab-2'])
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/TabBar.test.tsx`
Expected: FAIL — module 不存在。

- [ ] **Step 3: 實作**

```tsx
// src/views/TabBar.tsx
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { QuerySession } from '../hooks/tabs-reducer'

export interface TabBarProps {
  sessions: QuerySession[]
  activeId: string
  onOpen(): void
  onClose(id: string): void
  onSetActive(id: string): void
  onRename(id: string, title: string): void
}

export function TabBar({ sessions, activeId, onOpen, onClose, onSetActive, onRename }: TabBarProps) {
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-1 py-1">
      {sessions.map((s) => (
        <div
          key={s.id}
          onClick={() => onSetActive(s.id)}
          className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${s.id === activeId ? 'bg-white shadow-sm font-medium' : 'hover:bg-gray-200'}`}
        >
          {editing === s.id ? (
            <input
              autoFocus
              aria-label={`重新命名 ${s.title}`}
              defaultValue={s.title}
              onBlur={(e) => { onRename(s.id, e.target.value || s.title); setEditing(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              onClick={(e) => e.stopPropagation()}
              className="w-20 rounded border border-gray-300 px-1 text-sm"
            />
          ) : (
            <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(s.id) }}>{s.title}</span>
          )}
          <button
            type="button"
            aria-label={`關閉 ${s.title}`}
            onClick={(e) => { e.stopPropagation(); onClose(s.id) }}
            className="rounded p-0.5 opacity-0 hover:bg-gray-300 focus:opacity-100 group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button type="button" aria-label="開新分頁" onClick={onOpen} className="rounded p-1 hover:bg-gray-200">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/TabBar.test.tsx`
Expected: PASS（4 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/views/TabBar.tsx tests/frontend/TabBar.test.tsx
git commit -m "feat: [frontend] TabBar(分頁列 + 開關/重新命名)"
```

### Task 17: ResultGrid 改為受控 sort/filter

**Files:**
- Modify: `src/views/ResultGrid.tsx`
- Test: `tests/frontend/ResultGrid.test.tsx`

> 把階段 2 的本地 `query` / `sortField` / `sortDir` 改成由 props 傳入 + 回呼,
> 讓排序/結果搜尋隨分頁切換保留。`scrollTop` 與 `detail` 維持本地。

- [ ] **Step 1: 更新測試以受控介面呼叫**

把 `tests/frontend/ResultGrid.test.tsx` 既有測試中對 ResultGrid 的渲染改為帶受控 props。
新增/改寫關鍵測試:

```tsx
test('result search box calls onFilterChange (controlled)', () => {
  const calls: string[] = []
  render(
    <ResultGrid
      result={{ rows: [{ id: 1, label: 'apple' }], fields: ['id', 'label'], rowCount: 1, ms: 1 }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={(q) => calls.push(q)}
      onSort={() => {}}
    />,
  )
  fireEvent.change(screen.getByRole('searchbox', { name: '搜尋結果' }), { target: { value: 'app' } })
  expect(calls).toEqual(['app'])
})

test('applies the controlled filter to rows', () => {
  render(
    <ResultGrid
      result={{ rows: [{ id: 1, label: 'apple' }, { id: 2, label: 'banana' }], fields: ['id', 'label'], rowCount: 2, ms: 1 }}
      filter="app"
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={() => {}}
    />,
  )
  expect(screen.getByText('apple')).toBeDefined()
  expect(screen.queryByText('banana')).toBeNull()
})

test('clicking a header calls onSort with the field', () => {
  const calls: string[] = []
  render(
    <ResultGrid
      result={{ rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 1 }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={(f) => calls.push(f)}
    />,
  )
  fireEvent.click(screen.getByText('id'))
  expect(calls).toEqual(['id'])
})

test('clicking a cell still opens the detail modal', () => {
  render(
    <ResultGrid
      result={{ rows: [{ id: 1, label: 'apple' }], fields: ['id', 'label'], rowCount: 1, ms: 1 }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={() => {}}
    />,
  )
  fireEvent.click(screen.getByText('apple'))
  expect(screen.getByRole('dialog', { name: /label 內容/ })).toBeDefined()
})
```

（移除階段 2 中假設本地 state 的舊測試版本。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/ResultGrid.test.tsx`
Expected: FAIL — ResultGrid 尚未接受 `filter` / `onSort` 等 props。

- [ ] **Step 3: 實作 — ResultGrid 受控化**

把 `src/views/ResultGrid.tsx` 改為:

```tsx
import { useMemo, useRef, useState } from 'react'
import type { QueryResultDto } from '../api/types'
import { computeVisibleRange, nextSortDir, sortRows, type SortDir } from './grid-virtual'
import { filterRows } from './row-filter'
import { CellDetailModal } from '../components/CellDetailModal'

const ROW_HEIGHT = 28
const VIEWPORT_HEIGHT = 480
const OVERSCAN = 8

export interface ResultGridProps {
  result: QueryResultDto | null
  filter: string
  sortField: string | null
  sortDir: SortDir
  onFilterChange(filter: string): void
  onSort(field: string, dir: SortDir): void
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function ResultGrid({ result, filter, sortField, sortDir, onFilterChange, onSort }: ResultGridProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const [detail, setDetail] = useState<{ field: string; value: unknown; row: Record<string, unknown> } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    if (!result) return []
    const filtered = filterRows(result.rows, result.fields, filter)
    if (!sortField || !sortDir) return filtered
    return sortRows(filtered, sortField, sortDir)
  }, [result, sortField, sortDir, filter])

  if (!result) {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-400">尚無結果，執行查詢以查看資料</div>
  }

  const range = computeVisibleRange({ scrollTop, viewportHeight: VIEWPORT_HEIGHT, rowHeight: ROW_HEIGHT, rowCount: sorted.length, overscan: OVERSCAN })
  const visible = sorted.slice(range.start, range.end)

  const onHeaderClick = (field: string) => {
    const dir = field === sortField ? nextSortDir(sortDir) : 'asc'
    onSort(field, dir)
    setScrollTop(0)
    scrollRef.current?.scrollTo?.({ top: 0 })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 p-1">
        <input
          type="search"
          aria-label="搜尋結果"
          value={filter}
          onChange={(e) => { onFilterChange(e.target.value); setScrollTop(0) }}
          placeholder="搜尋結果…"
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-gray-500 focus:outline-none"
        />
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto"
        style={{ maxHeight: VIEWPORT_HEIGHT }}
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {result.fields.map((f) => (
                <th
                  key={f}
                  onClick={() => onHeaderClick(f)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHeaderClick(f) } }}
                  tabIndex={0}
                  aria-sort={sortField === f ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className="cursor-pointer select-none border-b border-gray-300 px-3 py-1 text-left font-medium"
                >
                  {f}
                  {sortField === f ? <span className="ml-1 text-gray-400">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {range.topPad > 0 ? (<tr style={{ height: range.topPad }}><td colSpan={result.fields.length} /></tr>) : null}
            {visible.map((row, i) => (
              <tr key={range.start + i} style={{ height: ROW_HEIGHT }} className="border-b border-gray-100">
                {result.fields.map((f) => (
                  <td
                    key={f}
                    data-col={f}
                    onClick={() => setDetail({ field: f, value: row[f], row })}
                    className="cursor-pointer truncate px-3 font-mono hover:bg-blue-50"
                  >
                    {renderCell(row[f])}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr><td colSpan={result.fields.length} className="py-6 text-center text-sm text-gray-400">查詢傳回 0 筆資料</td></tr>
            ) : null}
            {range.bottomPad > 0 ? (<tr style={{ height: range.bottomPad }}><td colSpan={result.fields.length} /></tr>) : null}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-gray-200 px-3 py-1 text-xs text-gray-500">
        {result.rowCount} 列{result.ms !== null ? ` · ${result.ms} ms` : ''}
      </footer>
      {detail ? (
        <CellDetailModal field={detail.field} value={detail.value} row={detail.row} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/ResultGrid.test.tsx`
Expected: PASS（受控介面測試全綠）。

- [ ] **Step 5: Commit**

```bash
git add src/views/ResultGrid.tsx tests/frontend/ResultGrid.test.tsx
git commit -m "refactor: [frontend] ResultGrid 受控 sort/filter(隨分頁保留)"
```

### Task 18: App 改接 useApp + TabBar，移除 useSidecar

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/hooks/useSidecar.ts`、`tests/frontend/useSidecar.test.ts`

- [ ] **Step 1: 重寫 App.tsx**

```tsx
// src/App.tsx
import { useApp } from './hooks/useApp'
import { ErrorBanner } from './components/ErrorBanner'
import { Sidebar } from './views/Sidebar'
import { Editor } from './views/Editor'
import { ResultGrid } from './views/ResultGrid'
import { ExportButton } from './views/ExportButton'
import { TabBar } from './views/TabBar'
import { HistoryPanel } from './views/HistoryPanel'

export function App() {
  const app = useApp()
  const { connections: conn, tabs, history } = app
  const active = tabs.active

  if (!conn.online) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-600">
        <p id="offline-msg" className="text-lg">引擎未連線</p>
        <button
          type="button"
          aria-describedby="offline-msg"
          onClick={() => location.reload()}
          className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700"
        >
          重試
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ErrorBanner error={conn.error} onDismiss={conn.dismissError} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          connections={conn.connections}
          activeConnectionId={conn.activeConnectionId}
          tree={conn.tree}
          expandedColumns={conn.expandedColumns}
          onSelectConnection={conn.selectConnection}
          onLoadColumns={conn.loadTableColumns}
          onInsertSelect={(t) => tabs.loadSql(`SELECT * FROM ${t} LIMIT 100`)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar
            sessions={tabs.sessions}
            activeId={tabs.activeId}
            onOpen={tabs.openTab}
            onClose={tabs.closeTab}
            onSetActive={tabs.setActive}
            onRename={tabs.renameTab}
          />
          <ErrorBanner error={active.error} onDismiss={tabs.dismissError} />
          <div className="flex items-center justify-between border-b border-gray-200 p-2">
            <Editor sql={active.sql} loading={active.loading} onChange={tabs.setSql} onRun={tabs.runQuery} />
            <ExportButton hasResult={!!active.result} onExport={app.exportResult} />
          </div>
          <ResultGrid
            result={active.result}
            filter={active.resultFilter}
            sortField={active.sortField}
            sortDir={active.sortDir}
            onFilterChange={tabs.setResultFilter}
            onSort={tabs.setSort}
          />
        </main>
        <HistoryPanel
          entries={history.entries}
          now={Date.now()}
          onPick={tabs.loadSql}
          onClear={history.clear}
        />
      </div>
    </div>
  )
}
```

> 注意:`Sidebar` 的 `onInsertSelect(t)` 收的是 table 名稱;舊 `useSidecar.insertSelect`
> 會組 `SELECT * FROM t LIMIT 100`。新架構沒有等價 action,故在 App 直接以小包裝
> `(t) => tabs.loadSql(\`SELECT * FROM ${t} LIMIT 100\`)` 保留同語意(上方已照此寫)。

- [ ] **Step 2: 刪除舊 useSidecar 與其測試**

```bash
git rm src/hooks/useSidecar.ts tests/frontend/useSidecar.test.ts
```

- [ ] **Step 3: 全套測試 + typecheck**

Run: `bun test && bunx tsc --noEmit`
Expected: 全綠。`useSidecar` 已無引用（App 已改用 useApp;Editor/ResultGrid/Sidebar/ExportButton 介面相容）。

> 若 tsc 報 `useSidecar` 仍被引用,搜尋 `grep -rn useSidecar src tests` 清掉殘留。

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: [frontend] App 改接 useApp + TabBar，移除 useSidecar"
```

### Task 19: 階段 4 E2E — 多分頁獨立

**Files:**
- Create: `tests/e2e/journeys/tabs.e2e.ts`

- [ ] **Step 1: 寫 E2E**

```ts
// tests/e2e/journeys/tabs.e2e.ts
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('a second tab runs queries independently of the first', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'main' }).click()

  // tab 1: query orders
  const editor = page.getByRole('textbox', { name: 'SQL 查詢' })
  await editor.fill('SELECT * FROM orders')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('orders-row-1')).toBeVisible()

  // open tab 2: fresh empty session, no result
  await page.getByRole('button', { name: '開新分頁' }).click()
  await expect(editor).toHaveValue('')
  await expect(page.getByText('orders-row-1')).toHaveCount(0)

  // run a different query in tab 2
  await editor.fill('SELECT * FROM users')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('a@example.com')).toBeVisible()

  // back to tab 1: its orders result is preserved
  await page.getByText('查詢 1').click()
  await expect(page.getByText('orders-row-1')).toBeVisible()
  await expect(editor).toHaveValue('SELECT * FROM orders')
})
```

- [ ] **Step 2: 跑 E2E 確認通過**

Run: `bun run e2e tests/e2e/journeys/tabs.e2e.ts`
Expected: 1 passed。

- [ ] **Step 3: 跑完整 E2E 套件確認既有旅程不回歸**

Run: `bun run e2e`
Expected: 全綠（原 4 旅程 + search 2 + history 1 + tabs 1）。

> 既有 `happy-path` / `export` / `errors` / `blacklist` 旅程仍應通過。
> 若 `export` / `errors` 因 ResultGrid 多了搜尋列或結果區結構微調而選擇器失準,
> 依新結構調整其定位器（僅選擇器層級,不改旅程語意）。

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/journeys/tabs.e2e.ts
git commit -m "test: [e2e] 多分頁獨立 session 旅程"
```

### Task 20: 收尾 — 全套驗證 + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 全套驗證**

Run:
```bash
bun test
bunx tsc --noEmit
bun run e2e
```
Expected:`bun test` 全綠(原 122 + 新增單元測試)、`tsc` 無輸出、`bun run e2e` 全綠。

- [ ] **Step 2: README 補一段功能說明**

在 `README.md` 的「## v1 scope」段落後（或合適處）加:

```markdown
## v1.x 易用性

- **多查詢分頁**:每分頁是獨立查詢 session（各自 SQL/結果/排序/結果搜尋）;連線、schema 樹、查詢歷史跨分頁共用。
- **查詢歷史**:執行過的查詢記在本機（localStorage、去重、上限 100、標記連線來源），點擊回填到當前分頁。
- **schema 樹搜尋 / 結果搜尋**:側邊資料表與結果列皆可即時子字串過濾（客戶端）。
- **單格詳閱**:點結果格看完整值（JSON/長文字），可複製單格或整列。
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: [frontend] README 補 v1.x 易用性功能說明"
```

---

## 自我檢視結果（spec 對照）

- ✅ schema 樹搜尋 → Task 1–3
- ✅ 結果搜尋 / 複製格/列 / CellDetail → Task 4–7
- ✅ 查詢歷史（localStorage/去重/上限/標記連線/回填）→ Task 8–11
- ✅ 多分頁獨立 session（連線/schema/歷史共用）→ Task 12–19
- ✅ 每分頁錯誤（App 掛 active.error 的 ErrorBanner）→ Task 18
- ✅ 狀態取向 A（useApp 組合 useConnections/useHistory/useTabs）→ Task 13–15
- ✅ 測試:單元（tree-filter/row-filter/CellDetailModal/useHistory/HistoryPanel/tabs-reducer/useConnections/useTabs/useApp/TabBar）+ E2E（search/history/tabs）
- ✅ 非目標未納入（無語法高亮、無後端過濾、無欄寬持久化、無資料編輯）

型別一致性:`QuerySession`、`HistoryEntry`、`ConnectionsApi`、`TabsApi`、`AppApi`、`ResultGridProps`
（`filter`/`sortField`/`sortDir`/`onFilterChange`/`onSort`）跨任務命名一致;`toApiError` 由
`useConnections` 匯出供 `useTabs`/`useApp` 共用,避免重複定義。
