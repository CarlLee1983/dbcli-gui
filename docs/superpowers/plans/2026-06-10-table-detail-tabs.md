# 表格多頁籤(Sequel Ace 式) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「點側欄資料表 → 單一可編輯內容視圖」升級為一張表 = 一個頂層分頁、內含「結構 / 內容 / 關聯 / 觸發器 / 資訊」五個子頁籤,並提供「以此表開新查詢」按鈕。

**Architecture:** 單 repo 兩層。Sidecar 新增 `dialect.ts`(依 `connection.system` 分流的純函式 SQL builder,MySQL/MariaDB 共用、PostgreSQL 另寫)與 `routes/table-detail.ts`(三個 lazy 端點:triggers / info / relations,皆先過 `BlacklistManager`)。前端把現有 `QuerySession.browse` 欄位升級成功能更完整的 `QuerySession.table: TableSession`(帶 `subTab` + 各子頁籤 lazy 快取),新增 `TableTab` 容器與四個檢視子元件,「內容」子頁籤直接複用既有 `TableBrowser`。

> **與 spec 的唯一差異(刻意):** spec 畫的是頂層 `kind: 'query' | 'table'` 判別聯集取代 `browse` 旗標。本計畫改為**沿用既有模式**:在 `QuerySession` 上把 `browse` 欄位改名並擴充為 `table: TableSession | null`(`table != null` 即為「表分頁」)。這完全滿足 spec 的所有功能需求(子頁籤、lazy 快取、一表一分頁聚焦、開新查詢、內容沿用 TableBrowser),但大幅降低對 `useTabs`/`App`/既有測試的改動面與風險。每個 commit 都保持綠燈。

**Tech Stack:** Bun + TypeScript、React 19、`@carllee1983/dbcli/core`(adapter / BlacklistManager)、zod、Tailwind、`bun test`(单元/整合)、Playwright(E2E)。

**全域約定(每個 sidecar 路由都照做):**
- `entry.adapter.execute<T>(sql, params)` 回 `ExecutionResult<T>`,讀 `.rows`。MySQL/MariaDB 佔位符用 `?`;PostgreSQL 用 `$1, $2`。
- 系統字串:`(entry.config.connection as { system: string }).system`,值為 `'mysql' | 'mariadb' | 'postgresql'`。
- 錯誤一律 `toErrorBody(err)` + `statusForCode(...)`(見 `shared/errors.ts`)。
- Blacklist:被保護的表 → 回 `BlacklistError(...,'schema')` → `BLACKLISTED`(403)。
- 識別字(table 名)來自 server 列舉的 schema tree,非自由輸入;`SHOW CREATE TABLE` 這種無法參數化識別字的查詢,以反引號跳脫包裹。

---

## File Structure

**Sidecar(新增/修改):**
- Create `sidecar/dialect.ts` — 依系統回傳 `TableDialect`(純函式 SQL builder)。
- Create `sidecar/routes/table-detail.ts` — `makeTableDetailHandlers(pool)` → `{ triggers, info, relations }`。
- Modify `sidecar/server.ts` — 綁定 `/schema/triggers`、`/schema/info`、`/schema/relations`。
- (重用 `shared/schemas.ts` 既有 `SchemaTableBody`;三端點 body 同形,不新增 schema。)

**前端(新增/修改):**
- Modify `src/api/types.ts` — 加 `TriggerDto`、`TableInfoDto`、`RelationRef`、`RelationsDto`、`SubTab`。
- Modify `src/api/client.ts` — `DbClient` 加 `tableTriggers` / `tableInfo` / `tableRelations` 三方法 + 實作。
- Modify `src/hooks/tabs-reducer.ts` — `BrowseSession` → `TableSession`(擴充);`QuerySession.browse` → `QuerySession.table`;新增 reducer actions。
- Modify `src/hooks/useTabs.ts` — 對應新 actions 的 API 方法。
- Modify `src/hooks/useApp.ts` — `browseTable` → `openTableTab`;新增 `loadSubTab`;`editQueryResult` 改開「內容」表分頁。
- Create `src/views/table/StructureTab.tsx`、`RelationsTab.tsx`、`TriggersTab.tsx`、`InfoTab.tsx`。
- Create `src/views/TableTab.tsx` — 子頁籤列 + 「以此表開新查詢」+ 依 `subTab` 切換內容。
- Modify `src/views/TableBrowser.tsx` — 無需改動(沿用),由 `TableTab` 在 `content` 子頁籤渲染。
- Modify `src/views/Sidebar.tsx` — 表名點擊 → 開表分頁(結構);鉛筆 → 開表分頁(內容+編輯)。
- Modify `src/App.tsx` — `active.table ?` 渲染 `<TableTab>`,否則查詢編輯器。

**測試(新增/修改):**
- Create `tests/sidecar/dialect.test.ts`、`tests/sidecar/table-detail-route.test.ts`。
- Modify `tests/frontend/tabs-reducer.test.ts`、`tests/frontend/useApp.test.ts`、`tests/frontend/Sidebar.test.tsx`。
- Create `tests/frontend/TableTab.test.tsx`、`tests/frontend/table-subtabs.test.tsx`。
- Create `tests/e2e/journeys/table-tabs.e2e.ts`。

---

## Task 1: Sidecar 方言表 `dialect.ts`

**Files:**
- Create: `sidecar/dialect.ts`
- Test: `tests/sidecar/dialect.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/sidecar/dialect.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { dialectFor } from '../../sidecar/dialect'

test('mysql triggers query uses ? placeholder + DATABASE() scope', () => {
  const q = dialectFor('mysql').triggers('orders')
  expect(q.params).toEqual(['orders'])
  expect(q.sql).toContain('information_schema.TRIGGERS')
  expect(q.sql).toContain('EVENT_OBJECT_TABLE = ?')
  expect(q.sql).toContain('TRIGGER_SCHEMA = DATABASE()')
})

test('mariadb shares the mysql dialect', () => {
  expect(dialectFor('mariadb').triggers('t')).toEqual(dialectFor('mysql').triggers('t'))
})

test('postgresql triggers query uses $1 placeholder', () => {
  const q = dialectFor('postgresql').triggers('orders')
  expect(q.params).toEqual(['orders'])
  expect(q.sql).toContain('information_schema.triggers')
  expect(q.sql).toContain('event_object_table = $1')
})

test('mysql reverseRelations keys on REFERENCED_TABLE_NAME', () => {
  const q = dialectFor('mysql').reverseRelations('users')
  expect(q.params).toEqual(['users'])
  expect(q.sql).toContain('information_schema.KEY_COLUMN_USAGE')
  expect(q.sql).toContain('REFERENCED_TABLE_NAME = ?')
})

test('postgresql reverseRelations uses $1 and pg catalog/info_schema', () => {
  const q = dialectFor('postgresql').reverseRelations('users')
  expect(q.params).toEqual(['users'])
  expect(q.sql).toContain('$1')
})

test('mysql info query reads engine/rows/size/collation/create_time', () => {
  const q = dialectFor('mysql').info('orders')
  expect(q.params).toEqual(['orders'])
  expect(q.sql).toContain('information_schema.TABLES')
  expect(q.sql).toContain('TABLE_NAME = ?')
})

test('mysql createTable returns a backtick-escaped SHOW CREATE TABLE, no params', () => {
  const q = dialectFor('mysql').createTable('we`ird')
  expect(q).not.toBeNull()
  expect(q!.sql).toBe('SHOW CREATE TABLE `we``ird`')
  expect(q!.params).toEqual([])
})

test('postgresql createTable returns null (no CREATE TABLE source)', () => {
  expect(dialectFor('postgresql').createTable('orders')).toBeNull()
})

test('unsupported system throws', () => {
  expect(() => dialectFor('mongodb')).toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/sidecar/dialect.test.ts`
Expected: FAIL — `Cannot find module '../../sidecar/dialect'`.

- [ ] **Step 3: Write minimal implementation**

Create `sidecar/dialect.ts`:

```ts
/** 一段參數化 SQL:`sql` 用對應方言的佔位符(MySQL `?` / PostgreSQL `$n`),`params` 依序對應。 */
export interface DialectQuery {
  sql: string
  params: Array<string | number | boolean | null>
}

export interface TableDialect {
  /** 該表的 trigger 清單(name / timing / event / statement)。 */
  triggers(table: string): DialectQuery
  /** 反向關聯:誰的外鍵參照本表(fromTable.fromColumn → 本表.toColumn)。 */
  reverseRelations(table: string): DialectQuery
  /** 單列表狀態:engine / rowCount / sizeBytes / collation / createdAt。 */
  info(table: string): DialectQuery
  /** CREATE 原文查詢;無法提供者(PostgreSQL 基底表)回 null。 */
  createTable(table: string): DialectQuery | null
}

/** 反引號跳脫識別字:MySQL/MariaDB `SHOW CREATE TABLE` 無法參數化識別字時使用。 */
function mysqlIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

const mysql: TableDialect = {
  triggers: (table) => ({
    sql:
      'SELECT TRIGGER_NAME AS name, ACTION_TIMING AS timing, ' +
      'EVENT_MANIPULATION AS event, ACTION_STATEMENT AS statement ' +
      'FROM information_schema.TRIGGERS ' +
      'WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = ? ' +
      'ORDER BY TRIGGER_NAME',
    params: [table],
  }),
  reverseRelations: (table) => ({
    sql:
      'SELECT TABLE_NAME AS fromTable, COLUMN_NAME AS fromColumn, ' +
      'REFERENCED_COLUMN_NAME AS toColumn, CONSTRAINT_NAME AS constraintName ' +
      'FROM information_schema.KEY_COLUMN_USAGE ' +
      'WHERE REFERENCED_TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = ? ' +
      'ORDER BY TABLE_NAME, COLUMN_NAME',
    params: [table],
  }),
  info: (table) => ({
    sql:
      'SELECT ENGINE AS engine, TABLE_ROWS AS rowCount, ' +
      '(DATA_LENGTH + INDEX_LENGTH) AS sizeBytes, ' +
      'TABLE_COLLATION AS collation, CREATE_TIME AS createdAt ' +
      'FROM information_schema.TABLES ' +
      'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    params: [table],
  }),
  createTable: (table) => ({ sql: `SHOW CREATE TABLE ${mysqlIdent(table)}`, params: [] }),
}

const postgresql: TableDialect = {
  triggers: (table) => ({
    sql:
      'SELECT trigger_name AS name, action_timing AS timing, ' +
      'event_manipulation AS event, action_statement AS statement ' +
      'FROM information_schema.triggers ' +
      'WHERE event_object_table = $1 ' +
      'ORDER BY trigger_name',
    params: [table],
  }),
  reverseRelations: (table) => ({
    sql:
      'SELECT tc.table_name AS "fromTable", kcu.column_name AS "fromColumn", ' +
      'ccu.column_name AS "toColumn", tc.constraint_name AS "constraintName" ' +
      'FROM information_schema.table_constraints tc ' +
      'JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name ' +
      'JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name ' +
      "WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = $1 " +
      'ORDER BY tc.table_name, kcu.column_name',
    params: [table],
  }),
  info: (table) => ({
    sql:
      'SELECT NULL AS engine, c.reltuples::bigint AS "rowCount", ' +
      'pg_total_relation_size(c.oid) AS "sizeBytes", ' +
      'NULL AS collation, NULL AS "createdAt" ' +
      'FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace ' +
      'WHERE n.nspname = current_schema() AND c.relname = $1',
    params: [table],
  }),
  createTable: () => null,
}

/** 依連線系統取得對應方言;MySQL/MariaDB 共用一組,PostgreSQL 另一組。 */
export function dialectFor(system: string): TableDialect {
  if (system === 'mysql' || system === 'mariadb') return mysql
  if (system === 'postgresql') return postgresql
  throw new Error(`Unsupported system for table detail: ${system}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/sidecar/dialect.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add sidecar/dialect.ts tests/sidecar/dialect.test.ts
git commit -m "feat: [sidecar] 表分頁方言查詢 builder (triggers/info/relations)"
```

---

## Task 2: Sidecar 路由 `table-detail.ts` + server 綁定

**Files:**
- Create: `sidecar/routes/table-detail.ts`
- Modify: `sidecar/server.ts`
- Test: `tests/sidecar/table-detail-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/sidecar/table-detail-route.test.ts`:

```ts
import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter, TableSchema, ExecutionResult } from '@carllee1983/dbcli/core'

const fakeConfig = {
  connection: { system: 'mysql' },
  permission: 'read-write',
  blacklist: { tables: ['secrets'], columns: {} },
} as unknown as DbcliConfig

const USERS_SCHEMA: TableSchema = {
  name: 'users',
  columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }],
  primaryKey: ['id'],
  foreignKeys: [{ name: 'fk_org', columns: ['org_id'], refTable: 'orgs', refColumns: ['id'] }],
}

// Route table-detail dispatches by SQL shape; the fake answers each query kind.
function fakeAdapter(): DatabaseAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    listTables: async () => [],
    getTableSchema: async (name: string) => (name === 'users' ? USERS_SCHEMA : { name, columns: [] }),
    execute: async <T>(sql: string): Promise<ExecutionResult<T>> => {
      const rows = (
        sql.includes('TRIGGERS')
          ? [{ name: 'trg_audit', timing: 'AFTER', event: 'INSERT', statement: 'BEGIN END' }]
          : sql.includes('KEY_COLUMN_USAGE')
            ? [{ fromTable: 'orders', fromColumn: 'user_id', toColumn: 'id', constraintName: 'fk_o' }]
            : sql.startsWith('SHOW CREATE TABLE')
              ? [{ Table: 'users', 'Create Table': 'CREATE TABLE `users` (...)' }]
              : sql.includes('information_schema.TABLES')
                ? [{ engine: 'InnoDB', rowCount: 42, sizeBytes: 16384, collation: 'utf8mb4_general_ci', createdAt: '2024-01-01' }]
                : []
      ) as unknown as T[]
      return { rows, affectedRows: 0 } as ExecutionResult<T>
    },
  } as unknown as DatabaseAdapter
}

let server: ReturnType<typeof createServer> | undefined
afterEach(async () => { await server?.stop(true) })
function start() {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter() })
  server = createServer({ pool, token: 'test', port: 0, dbcliPath: '/tmp/dbcli-gui-unused' })
  return server
}
const post = (s: ReturnType<typeof createServer>, path: string, body: unknown) =>
  fetch(`http://localhost:${s.port}${path}`, { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('triggers: NOT_OPEN when connection not opened', async () => {
  const s = start()
  const res = await post(s, '/schema/triggers', { connectionId: 'x', table: 'users' })
  expect(res.status).toBe(409)
})

test('triggers: returns the shaped list', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/triggers', { connectionId: 'main', table: 'users' })
  expect(res.status).toBe(200)
  const body = await res.json() as { triggers: Array<{ name: string }> }
  expect(body.triggers[0]!.name).toBe('trg_audit')
})

test('triggers: blacklisted table → 403 BLACKLISTED', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/triggers', { connectionId: 'main', table: 'secrets' })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('BLACKLISTED')
})

test('info: returns engine/rowCount/sizeBytes/createSql', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/info', { connectionId: 'main', table: 'users' })
  expect(res.status).toBe(200)
  const body = await res.json() as { info: { engine: string; rowCount: number; createSql: string } }
  expect(body.info.engine).toBe('InnoDB')
  expect(body.info.rowCount).toBe(42)
  expect(body.info.createSql).toContain('CREATE TABLE')
})

test('relations: returns forward (from schema FK) + reverse (from query)', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/relations', { connectionId: 'main', table: 'users' })
  expect(res.status).toBe(200)
  const body = await res.json() as { relations: { forward: unknown[]; reverse: Array<{ fromTable: string }> } }
  expect(body.relations.forward).toHaveLength(1)
  expect(body.relations.reverse[0]!.fromTable).toBe('orders')
})

test('triggers without token → 401', async () => {
  const s = start()
  const res = await fetch(`http://localhost:${s.port}/schema/triggers`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectionId: 'main', table: 'users' }),
  })
  expect(res.status).toBe(401)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/sidecar/table-detail-route.test.ts`
Expected: FAIL — `/schema/triggers` 404 (route not wired) / module missing.

- [ ] **Step 3: Write minimal implementation — the route**

Create `sidecar/routes/table-detail.ts`:

```ts
import { BlacklistManager, BlacklistError } from '@carllee1983/dbcli/core'
import type { ConnectionPool } from '../connection-pool'
import { SchemaTableBody } from '../../shared/schemas'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { dialectFor } from '../dialect'
import { json } from '../http'

interface RelationRef {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  constraintName?: string
}

/** Shared guard: parse body, resolve an open pool entry, reject blacklisted tables. */
async function resolve(pool: ConnectionPool, req: Request) {
  const parsed = SchemaTableBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return { error: json({ error: { code: 'BAD_REQUEST', message: 'connectionId + table required' } }, 400) }
  const entry = pool.get(parsed.data.connectionId)
  if (!entry) return { error: json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409) }
  const manager = new BlacklistManager(entry.config)
  if (manager.isTableBlacklisted(parsed.data.table)) {
    const body = toErrorBody(new BlacklistError(`${parsed.data.table} is protected`, parsed.data.table, 'schema'))
    return { error: json(body, statusForCode(body.error.code)) }
  }
  const system = (entry.config.connection as { system: string }).system
  return { entry, table: parsed.data.table, dialect: dialectFor(system) }
}

export function makeTableDetailHandlers(pool: ConnectionPool) {
  return {
    async triggers(req: Request): Promise<Response> {
      const r = await resolve(pool, req)
      if ('error' in r) return r.error
      try {
        const q = r.dialect.triggers(r.table)
        const res = await r.entry.adapter.execute<Record<string, unknown>>(q.sql, q.params)
        const triggers = res.rows.map((row) => ({
          name: String(row.name ?? ''),
          timing: String(row.timing ?? ''),
          event: String(row.event ?? ''),
          statement: String(row.statement ?? ''),
        }))
        return json({ triggers })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },

    async info(req: Request): Promise<Response> {
      const r = await resolve(pool, req)
      if ('error' in r) return r.error
      try {
        const q = r.dialect.info(r.table)
        const statusRes = await r.entry.adapter.execute<Record<string, unknown>>(q.sql, q.params)
        const row = statusRes.rows[0] ?? {}
        const createQ = r.dialect.createTable(r.table)
        let createSql: string | null = null
        if (createQ) {
          const cRes = await r.entry.adapter.execute<Record<string, unknown>>(createQ.sql, createQ.params)
          const cRow = cRes.rows[0]
          createSql = cRow ? String(cRow['Create Table'] ?? cRow['Create View'] ?? '') || null : null
        }
        const num = (v: unknown): number | null => (v == null ? null : Number(v))
        return json({
          info: {
            engine: row.engine == null ? null : String(row.engine),
            rowCount: num(row.rowCount),
            sizeBytes: num(row.sizeBytes),
            collation: row.collation == null ? null : String(row.collation),
            createdAt: row.createdAt == null ? null : String(row.createdAt),
            createSql,
          },
        })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },

    async relations(req: Request): Promise<Response> {
      const r = await resolve(pool, req)
      if ('error' in r) return r.error
      try {
        // Forward FKs come from the parsed schema (core already extracts them).
        const schema = await r.entry.adapter.getTableSchema(r.table)
        const forward: RelationRef[] = (schema.foreignKeys ?? []).flatMap((fk) =>
          fk.columns.map((col, i) => ({
            fromTable: r.table,
            fromColumn: col,
            toTable: fk.refTable,
            toColumn: fk.refColumns[i] ?? fk.refColumns[0] ?? '',
            constraintName: fk.name,
          })),
        )
        const q = r.dialect.reverseRelations(r.table)
        const res = await r.entry.adapter.execute<Record<string, unknown>>(q.sql, q.params)
        const reverse: RelationRef[] = res.rows.map((row) => ({
          fromTable: String(row.fromTable ?? ''),
          fromColumn: String(row.fromColumn ?? ''),
          toTable: r.table,
          toColumn: String(row.toColumn ?? ''),
          constraintName: row.constraintName == null ? undefined : String(row.constraintName),
        }))
        return json({ relations: { forward, reverse } })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },
  }
}
```

- [ ] **Step 4: Wire the routes in `server.ts`**

In `sidecar/server.ts` add the import near the other route imports (after line 13 `makeDataHandlers`):

```ts
import { makeTableDetailHandlers } from './routes/table-detail'
```

Inside `buildRoutes()`, after `const data = makeDataHandlers(store.pool)` add:

```ts
    const detail = makeTableDetailHandlers(store.pool)
```

In the returned routes object, after `'/schema/table': post(schema.table),` add:

```ts
      '/schema/triggers': post(detail.triggers),
      '/schema/info': post(detail.info),
      '/schema/relations': post(detail.relations),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/sidecar/table-detail-route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the full sidecar suite (no regressions)**

Run: `bun test tests/sidecar/`
Expected: PASS (all existing + new).

- [ ] **Step 7: Commit**

```bash
git add sidecar/routes/table-detail.ts sidecar/server.ts tests/sidecar/table-detail-route.test.ts
git commit -m "feat: [sidecar] /schema/triggers|info|relations 表分頁端點"
```

---

## Task 3: 前端 API 型別 + client 方法

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`
- Test: (覆蓋在 Task 5 的 useApp 測試;此處先擴充既有 fakeClient 不致型別破損)

- [ ] **Step 1: Add DTO types**

In `src/api/types.ts` append:

```ts
export type SubTab = 'structure' | 'content' | 'relations' | 'triggers' | 'info'

export interface TriggerDto {
  name: string
  timing: string
  event: string
  statement: string
}

export interface TableInfoDto {
  engine: string | null
  rowCount: number | null
  sizeBytes: number | null
  collation: string | null
  createdAt: string | null
  createSql: string | null
}

export interface RelationRef {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  constraintName?: string
}

export interface RelationsDto {
  forward: RelationRef[]
  reverse: RelationRef[]
}
```

- [ ] **Step 2: Extend the DbClient interface + import**

In `src/api/client.ts`, add to the type import block (after `Workspace,`):

```ts
  TriggerDto,
  TableInfoDto,
  RelationsDto,
```

Add to the `DbClient` interface (after `schemaTable(...)`):

```ts
  tableTriggers(id: string, table: string): Promise<TriggerDto[]>
  tableInfo(id: string, table: string): Promise<TableInfoDto>
  tableRelations(id: string, table: string): Promise<RelationsDto>
```

- [ ] **Step 3: Implement in `makeClient`**

In the returned object (after the `schemaTable:` entry):

```ts
    tableTriggers: async (id, table) => {
      const body = (await post('/schema/triggers', { connectionId: id, table })) as { triggers: TriggerDto[] }
      return body.triggers
    },
    tableInfo: async (id, table) => {
      const body = (await post('/schema/info', { connectionId: id, table })) as { info: TableInfoDto }
      return body.info
    },
    tableRelations: async (id, table) => {
      const body = (await post('/schema/relations', { connectionId: id, table })) as { relations: RelationsDto }
      return body.relations
    },
```

- [ ] **Step 4: Verify the project type-checks**

Run: `bunx tsc --noEmit`
Expected: FAIL only inside test files that build a `fakeClient` literal (they now miss the 3 new methods). That is expected and fixed in Task 5. Confirm there are **no** errors in `src/` itself.

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/api/client.ts
git commit -m "feat: [frontend] api client 加 triggers/info/relations 方法與 DTO"
```

---

## Task 4: tabs-reducer — `TableSession` 升級

**Files:**
- Modify: `src/hooks/tabs-reducer.ts`
- Test: `tests/frontend/tabs-reducer.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the final `reset` test in `tests/frontend/tabs-reducer.test.ts` and add new ones. First, update the import line:

```ts
import { tabsReducer, initTabs, type TableSession } from '../../src/hooks/tabs-reducer'
```

Replace the last test (`reset action ...`) with:

```ts
function tableInit(table = 'orders', connectionId = 'c1'): TableSession {
  return { connectionId, table, schema: { name: table, columns: [] }, subTab: 'structure' }
}

test('reset action 回到單一空白查詢分頁', () => {
  let state = initTabs()
  state = tabsReducer(state, { type: 'open' })
  state = tabsReducer(state, { type: 'open' })
  expect(state.sessions.length).toBe(3)
  const reset = tabsReducer(state, { type: 'reset' })
  expect(reset.sessions.length).toBe(1)
  expect(reset.sessions[0]!.sql).toBe('')
  expect(reset.sessions[0]!.table).toBeNull()
})

test('openTableTab 開新表分頁,title=表名,預設子頁籤', () => {
  const s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableInit('orders') })
  const active = s.sessions.find((x) => x.id === s.activeId)!
  expect(active.table?.table).toBe('orders')
  expect(active.table?.subTab).toBe('structure')
  expect(active.title).toBe('orders')
})

test('openTableTab 同 table+connection 已開 → 聚焦並切子頁籤,不重複開', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableInit('orders') })
  const firstCount = s.sessions.length
  s = tabsReducer(s, { type: 'openTableTab', session: { ...tableInit('orders'), subTab: 'content' } })
  expect(s.sessions.length).toBe(firstCount) // 沒有新開
  const active = s.sessions.find((x) => x.id === s.activeId)!
  expect(active.table?.table).toBe('orders')
  expect(active.table?.subTab).toBe('content')
})

test('setSubTab 改作用中表分頁的子頁籤', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableInit('orders') })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setSubTab', id, subTab: 'triggers' })
  expect(s.sessions.find((x) => x.id === id)!.table?.subTab).toBe('triggers')
})

test('setTableCache 寫入 lazy 快取', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableInit('orders') })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setTableCache', id, key: 'triggers', value: [{ name: 't', timing: 'AFTER', event: 'INSERT', statement: '' }] })
  expect(s.sessions.find((x) => x.id === id)!.table?.triggers).toHaveLength(1)
})

test('setTableRows 更新內容列', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: { ...tableInit('orders'), rows: [] } })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setTableRows', id, rows: [{ id: 1 }] })
  expect(s.sessions.find((x) => x.id === id)!.table?.rows).toEqual([{ id: 1 }])
})

test('setSubTabError 記錄單一子頁籤錯誤', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableInit('orders') })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setSubTabError', id, key: 'info', error: { code: 'PERMISSION', message: 'no', status: 403 } })
  expect(s.sessions.find((x) => x.id === id)!.table?.cacheErrors?.info?.code).toBe('PERMISSION')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/tabs-reducer.test.ts`
Expected: FAIL — `TableSession` not exported / unknown action types.

- [ ] **Step 3: Rewrite `tabs-reducer.ts`**

Replace `src/hooks/tabs-reducer.ts` entirely:

```ts
import type { QueryResultDto, TableSchemaDto, SubTab, TriggerDto, TableInfoDto, RelationsDto } from '../api/types'
import type { SortDir } from '../views/grid-virtual'
import type { ApiError } from '../api/client'

/** Lazy sub-tabs fetched on demand; undefined cache = not yet loaded. */
export type LazyKey = 'triggers' | 'info' | 'relations'

interface SubTabError { code: string; message: string; status: number }

export interface TableSession {
  connectionId: string
  table: string
  /** Structure + forward-FK source; fetched when the table tab opens. */
  schema: TableSchemaDto
  subTab: SubTab
  // Lazy caches (undefined = not loaded yet)
  triggers?: TriggerDto[]
  info?: TableInfoDto
  relations?: RelationsDto
  // Per-sub-tab fetch errors (inline display; one failure never clobbers another)
  cacheErrors?: Partial<Record<LazyKey, SubTabError>>
  // Content sub-tab state — reused by TableBrowser
  rows?: Array<Record<string, unknown>>
  // The query that (re)fetches the content rows; replayed after a save.
  sql?: string
  // Result column names for an arbitrary-SQL edit; undefined = full schema browse.
  fields?: string[]
}

export interface QuerySession {
  id: string
  title: string
  sql: string
  executedSql: string
  result: QueryResultDto | null
  sortField: string | null
  sortDir: SortDir | null
  resultFilter: string
  loading: boolean
  error: ApiError | null
  /** Non-null = this tab is a "table tab" (renders TableTab); null = query editor. */
  table: TableSession | null
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
    executedSql: '',
    result: null,
    sortField: null,
    sortDir: null,
    resultFilter: '',
    loading: false,
    error: null,
    table: null,
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
  | { type: 'openTableTab'; session: TableSession }
  | { type: 'setTableRows'; id: string; rows: Array<Record<string, unknown>> }
  | { type: 'setSubTab'; id: string; subTab: SubTab }
  | { type: 'setTableCache'; id: string; key: LazyKey; value: TriggerDto[] | TableInfoDto | RelationsDto }
  | { type: 'setSubTabError'; id: string; key: LazyKey; error: SubTabError }
  | { type: 'reset' }

/** Apply a function to one session's `table` payload (no-op if it isn't a table tab). */
function mapTable(
  state: TabsState,
  id: string,
  fn: (t: TableSession) => TableSession,
): TabsState {
  return {
    ...state,
    sessions: state.sessions.map((s) => (s.id === id && s.table != null ? { ...s, table: fn(s.table) } : s)),
  }
}

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
        const nextIdx = Math.min(idx, remaining.length - 1)
        activeId = remaining[nextIdx]!.id
      }
      return { ...state, sessions: remaining, activeId }
    }
    case 'rename':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, title: action.title } : s)) }
    case 'setActive':
      return state.sessions.some((s) => s.id === action.id) ? { ...state, activeId: action.id } : state
    case 'patch':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) }
    case 'openTableTab': {
      // Dedupe: same table on same connection → focus it + switch sub-tab, don't reopen.
      const existing = state.sessions.find(
        (s) => s.table?.table === action.session.table && s.table?.connectionId === action.session.connectionId,
      )
      if (existing) {
        return {
          ...state,
          activeId: existing.id,
          sessions: state.sessions.map((s) =>
            s.id === existing.id && s.table != null
              ? { ...s, table: { ...s.table, subTab: action.session.subTab, ...contentPatch(action.session) } }
              : s,
          ),
        }
      }
      const seq = state.seq + 1
      const s: QuerySession = { ...emptySession(seq), title: action.session.table, table: action.session }
      return { sessions: [...state.sessions, s], activeId: s.id, seq }
    }
    case 'setTableRows':
      return mapTable(state, action.id, (t) => ({ ...t, rows: action.rows }))
    case 'setSubTab':
      return mapTable(state, action.id, (t) => ({ ...t, subTab: action.subTab }))
    case 'setTableCache':
      return mapTable(state, action.id, (t) => ({ ...t, [action.key]: action.value }))
    case 'setSubTabError':
      return mapTable(state, action.id, (t) => ({ ...t, cacheErrors: { ...t.cacheErrors, [action.key]: action.error } }))
    case 'reset': {
      const seq = state.seq + 1
      const s = emptySession(seq)
      return { sessions: [s], activeId: s.id, seq }
    }
    default:
      return state
  }
}

/** When re-focusing an existing table tab with content payload (edit flow), carry rows/sql/fields. */
function contentPatch(next: TableSession): Partial<TableSession> {
  const patch: Partial<TableSession> = {}
  if (next.rows !== undefined) patch.rows = next.rows
  if (next.sql !== undefined) patch.sql = next.sql
  if (next.fields !== undefined) patch.fields = next.fields
  return patch
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/frontend/tabs-reducer.test.ts`
Expected: PASS (all reducer tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/tabs-reducer.ts tests/frontend/tabs-reducer.test.ts
git commit -m "refactor: [frontend] BrowseSession→TableSession(子頁籤+lazy 快取)"
```

---

## Task 5: useTabs + useApp 接線

**Files:**
- Modify: `src/hooks/useTabs.ts`
- Modify: `src/hooks/useApp.ts`
- Test: `tests/frontend/useApp.test.ts`

- [ ] **Step 1: Update useTabs API**

In `src/hooks/useTabs.ts`:

Update the import:

```ts
import { tabsReducer, initTabs, type QuerySession, type TableSession, type LazyKey } from './tabs-reducer'
import type { SubTab, TriggerDto, TableInfoDto, RelationsDto } from '../api/types'
```

Replace the `openBrowse` / `setBrowseRows` lines in the `TabsApi` interface with:

```ts
  openTableTab(session: TableSession): void
  setTableRows(id: string, rows: Array<Record<string, unknown>>): void
  setSubTab(id: string, subTab: SubTab): void
  setTableCache(id: string, key: LazyKey, value: TriggerDto[] | TableInfoDto | RelationsDto): void
  setSubTabError(id: string, key: LazyKey, error: { code: string; message: string; status: number }): void
```

Replace the matching `const openBrowse` / `const setBrowseRows` callbacks with:

```ts
  const openTableTab = useCallback((session: TableSession) => dispatch({ type: 'openTableTab', session }), [])
  const setTableRows = useCallback((id: string, rows: Array<Record<string, unknown>>) => dispatch({ type: 'setTableRows', id, rows }), [])
  const setSubTab = useCallback((id: string, subTab: SubTab) => dispatch({ type: 'setSubTab', id, subTab }), [])
  const setTableCache = useCallback((id: string, key: LazyKey, value: TriggerDto[] | TableInfoDto | RelationsDto) => dispatch({ type: 'setTableCache', id, key, value }), [])
  const setSubTabError = useCallback((id: string, key: LazyKey, error: { code: string; message: string; status: number }) => dispatch({ type: 'setSubTabError', id, key, error }), [])
```

Update the returned object: replace `openBrowse, setBrowseRows,` with `openTableTab, setTableRows, setSubTab, setTableCache, setSubTabError,`.

- [ ] **Step 2: Update useApp**

In `src/hooks/useApp.ts`:

Update imports:

```ts
import type { MutateOps, SubTab, LazyKey } from '../api/types'
```

(Note: `LazyKey` is exported from `tabs-reducer`, not `types`. Import it from there instead:)

```ts
import type { MutateOps, SubTab } from '../api/types'
import type { LazyKey } from './tabs-reducer'
```

Replace the `browseTable` method in `AppApi` and its implementation. New `AppApi` lines (replace `browseTable(table: string): Promise<void>`):

```ts
  openTableTab(table: string, subTab?: SubTab): Promise<void>
  loadSubTab(tabId: string, key: LazyKey): Promise<void>
```

Replace the `browseTable` callback implementation with:

```ts
  const openTableTab = useCallback(async (table: string, subTab: SubTab = 'structure') => {
    const connId = connections.activeConnectionId
    if (!connId) return
    try {
      const schema = await connections.client.schemaTable(connId, table)
      // `table` is a server-enumerated identifier from the schema tree (not free user input).
      const sql = `SELECT * FROM ${table} LIMIT 200`
      // Content sub-tab needs rows up front so the browser renders immediately.
      const rows = subTab === 'content' ? (await connections.client.query(connId, sql)).rows : undefined
      tabs.openTableTab({ connectionId: connId, table, schema, subTab, sql, rows })
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs.openTableTab])

  // Lazy-load a sub-tab's data the first time it is shown. Errors are scoped to the
  // sub-tab (stored on the session) so one failure never blanks the others.
  const loadSubTab = useCallback(async (tabId: string, key: LazyKey) => {
    const connId = connections.activeConnectionId
    const session = tabs.sessions.find((s) => s.id === tabId)
    const t = session?.table
    if (!connId || !t) return
    if (t[key] !== undefined) return // already cached
    try {
      const value =
        key === 'triggers' ? await connections.client.tableTriggers(connId, t.table)
        : key === 'info' ? await connections.client.tableInfo(connId, t.table)
        : await connections.client.tableRelations(connId, t.table)
      tabs.setTableCache(tabId, key, value)
    } catch (err) {
      const e = toApiError(err)
      tabs.setSubTabError(tabId, key, { code: e.code, message: e.message, status: e.status })
    }
  }, [connections, tabs.sessions, tabs.setTableCache, tabs.setSubTabError])
```

Replace the `editQueryResult` body's `tabs.openBrowse({ ... })` call with the table-tab form (opens a content table tab):

```ts
      tabs.openTableTab({ connectionId: connId, table, schema, subTab: 'content', rows: result.rows, sql, fields: result.fields })
```

Update `saveTableEdits`: the refetch SQL source is now the table session. Replace `tabs.active.browse?.sql` with `tabs.active.table?.sql` and `tabs.setBrowseRows(...)` with `tabs.setTableRows(...)`:

```ts
    const refetchSql = tabs.active.table?.sql ?? `SELECT * FROM ${table} LIMIT 200`
```
```ts
      tabs.setTableRows(tabId, result.rows)
```
And update its dependency array: `[connections, tabs.activeId, tabs.active.table, tabs.setTableRows]`.

Finally, update the returned object: replace `browseTable` with `openTableTab, loadSubTab`.

- [ ] **Step 3: Update useApp tests**

In `tests/frontend/useApp.test.ts`:

Add the 3 new methods to the `fakeClient` default object (after `schemaTable:` line):

```ts
    tableTriggers: async () => [],
    tableInfo: async () => ({ engine: 'InnoDB', rowCount: 0, sizeBytes: 0, collation: null, createdAt: null, createSql: null }),
    tableRelations: async () => ({ forward: [], reverse: [] }),
```

Replace the `browseTable` test with an `openTableTab` test:

```ts
test('openTableTab(structure) calls schemaTable and opens a table tab (no query)', async () => {
  const schemaTableCalls: string[] = []
  const queryCalls: string[] = []
  const { result } = renderHook(() => useApp(fakeClient({
    schemaTable: async (id, table) => { schemaTableCalls.push(table); return { name: table, columns: [] } },
    query: async (id, sql) => { queryCalls.push(sql); return { rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 2 } },
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  await act(async () => { await result.current.openTableTab('orders', 'structure') })
  expect(schemaTableCalls).toContain('orders')
  expect(queryCalls).toHaveLength(0) // structure doesn't fetch rows
  expect(result.current.tabs.active.table?.table).toBe('orders')
  expect(result.current.tabs.active.table?.subTab).toBe('structure')
})

test('openTableTab(content) fetches rows for the browser', async () => {
  const queryCalls: string[] = []
  const { result } = renderHook(() => useApp(fakeClient({
    query: async (id, sql) => { queryCalls.push(sql); return { rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 2 } },
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  await act(async () => { await result.current.openTableTab('orders', 'content') })
  expect(queryCalls.some((sql) => sql.includes('orders'))).toBe(true)
  expect(result.current.tabs.active.table?.rows).toEqual([{ id: 1 }])
})

test('loadSubTab caches triggers and is a no-op on second call', async () => {
  let calls = 0
  const { result } = renderHook(() => useApp(fakeClient({
    tableTriggers: async () => { calls++; return [{ name: 't', timing: 'AFTER', event: 'INSERT', statement: '' }] },
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  await act(async () => { await result.current.openTableTab('orders', 'structure') })
  const id = result.current.tabs.activeId
  await act(async () => { await result.current.loadSubTab(id, 'triggers') })
  await act(async () => { await result.current.loadSubTab(id, 'triggers') })
  expect(calls).toBe(1)
  expect(result.current.tabs.active.table?.triggers).toHaveLength(1)
})

test('loadSubTab stores a per-sub-tab error on failure', async () => {
  const { result } = renderHook(() => useApp(fakeClient({
    tableInfo: async () => { throw new Error('boom') },
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  await act(async () => { await result.current.openTableTab('orders', 'structure') })
  const id = result.current.tabs.activeId
  await act(async () => { await result.current.loadSubTab(id, 'info') })
  expect(result.current.tabs.active.table?.cacheErrors?.info).toBeTruthy()
})
```

In the remaining `saveTableEdits` / `editQueryResult` tests, replace every `.browse` access with `.table` (e.g. `result.current.tabs.active.browse?.table` → `result.current.tabs.active.table?.table`; `.browse?.sql` → `.table?.sql`; `.browse?.fields` → `.table?.fields`; `.browse).toBeNull()` → `.table).toBeNull()`). The `saveTableEdits` tests that call `browseTable('orders')` to set up a tab must call `openTableTab('orders', 'content')` instead.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/frontend/useApp.test.ts tests/frontend/tabs-reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTabs.ts src/hooks/useApp.ts tests/frontend/useApp.test.ts
git commit -m "feat: [frontend] useApp openTableTab + loadSubTab(lazy 子頁籤)"
```

---

## Task 6: StructureTab 元件

**Files:**
- Create: `src/views/table/StructureTab.tsx`
- Test: `tests/frontend/table-subtabs.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/table-subtabs.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { StructureTab } from '../../src/views/table/StructureTab'
import type { TableSchemaDto } from '../../src/api/types'

afterEach(cleanup)

const schema: TableSchemaDto = {
  name: 'users',
  columns: [
    { name: 'id', type: 'int', nullable: false, primaryKey: true },
    { name: 'email', type: 'text', nullable: true },
  ],
  primaryKey: ['id'],
  indexes: [{ name: 'idx_email', columns: ['email'], unique: true }],
}

test('StructureTab renders columns with type/null/PK', () => {
  render(<StructureTab schema={schema} />)
  expect(screen.getByText('id')).toBeDefined()
  expect(screen.getByText('email')).toBeDefined()
  expect(screen.getByText('idx_email')).toBeDefined()
})

test('StructureTab shows empty state for no columns', () => {
  render(<StructureTab schema={{ name: 'x', columns: [] }} />)
  expect(screen.getByText(/無欄位/)).toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/table-subtabs.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement StructureTab**

Create `src/views/table/StructureTab.tsx`:

```tsx
import { KeyRound } from 'lucide-react'
import type { TableSchemaDto } from '../../api/types'

export function StructureTab({ schema }: { schema: TableSchemaDto }) {
  const pk = new Set(schema.primaryKey ?? [])
  if (schema.columns.length === 0) {
    return <div className="p-4 text-xs text-slate-400 dark:text-slate-500">此表無欄位資訊。</div>
  }
  return (
    <div className="h-full overflow-auto p-3 text-xs">
      <table className="w-full border-separate border-spacing-0 text-left font-mono">
        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
          <tr>
            {['欄位', '型別', 'Null', '預設', 'PK'].map((h) => (
              <th key={h} className="border-b border-slate-200 dark:border-slate-700 px-3 py-2 font-semibold text-slate-700 dark:text-slate-300">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schema.columns.map((c) => (
            <tr key={c.name}>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5 text-slate-800 dark:text-slate-300">{c.name}</td>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5 text-slate-500 dark:text-slate-400">{c.type}</td>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5 text-slate-500 dark:text-slate-400">{c.nullable ? 'YES' : 'NO'}</td>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5 text-slate-500 dark:text-slate-400">{c.default ?? ''}</td>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5">
                {pk.has(c.name) ? <KeyRound className="h-3.5 w-3.5 text-amber-500" aria-label="主鍵" /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {schema.indexes && schema.indexes.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">索引</h3>
          <ul className="flex flex-col gap-0.5">
            {schema.indexes.map((idx) => (
              <li key={idx.name} className="px-1 py-0.5 font-mono text-slate-600 dark:text-slate-400">
                {idx.name} {idx.unique ? <span className="text-[10px] text-emerald-600">UNIQUE</span> : null} ({idx.columns.join(', ')})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/frontend/table-subtabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/table/StructureTab.tsx tests/frontend/table-subtabs.test.tsx
git commit -m "feat: [frontend] StructureTab 結構子頁籤"
```

---

## Task 7: TriggersTab + InfoTab + RelationsTab 元件

**Files:**
- Create: `src/views/table/TriggersTab.tsx`, `src/views/table/InfoTab.tsx`, `src/views/table/RelationsTab.tsx`
- Test: append to `tests/frontend/table-subtabs.test.tsx`

- [ ] **Step 1: Write the failing tests (append)**

Append to `tests/frontend/table-subtabs.test.tsx`:

```tsx
import { TriggersTab } from '../../src/views/table/TriggersTab'
import { InfoTab } from '../../src/views/table/InfoTab'
import { RelationsTab } from '../../src/views/table/RelationsTab'

const err = { code: 'PERMISSION', message: '受保護', status: 403 }

test('TriggersTab: loading / list / empty / error', () => {
  const { rerender } = render(<TriggersTab triggers={undefined} error={undefined} />)
  expect(screen.getByText(/載入中/)).toBeDefined()
  rerender(<TriggersTab triggers={[{ name: 'trg', timing: 'AFTER', event: 'INSERT', statement: 'X' }]} error={undefined} />)
  expect(screen.getByText('trg')).toBeDefined()
  rerender(<TriggersTab triggers={[]} error={undefined} />)
  expect(screen.getByText(/沒有觸發器/)).toBeDefined()
  rerender(<TriggersTab triggers={undefined} error={err} />)
  expect(screen.getByText(/受保護/)).toBeDefined()
})

test('InfoTab: renders metrics + CREATE block + null create note', () => {
  const { rerender } = render(<InfoTab info={{ engine: 'InnoDB', rowCount: 42, sizeBytes: 16384, collation: 'utf8mb4', createdAt: '2024', createSql: 'CREATE TABLE x' }} error={undefined} />)
  expect(screen.getByText('InnoDB')).toBeDefined()
  expect(screen.getByText(/CREATE TABLE x/)).toBeDefined()
  rerender(<InfoTab info={{ engine: null, rowCount: null, sizeBytes: null, collation: null, createdAt: null, createSql: null }} error={undefined} />)
  expect(screen.getByText(/不提供 CREATE/)).toBeDefined()
})

test('RelationsTab: forward + reverse + both-empty state', () => {
  const { rerender } = render(<RelationsTab relations={{ forward: [{ fromTable: 'o', fromColumn: 'uid', toTable: 'users', toColumn: 'id' }], reverse: [] }} error={undefined} />)
  expect(screen.getByText(/uid/)).toBeDefined()
  rerender(<RelationsTab relations={{ forward: [], reverse: [] }} error={undefined} />)
  expect(screen.getByText(/沒有關聯/)).toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/table-subtabs.test.tsx`
Expected: FAIL — three modules missing.

- [ ] **Step 3: Implement the three components**

Create `src/views/table/TriggersTab.tsx`:

```tsx
import type { TriggerDto } from '../../api/types'

interface SubTabError { code: string; message: string; status: number }

export function TriggersTab({ triggers, error }: { triggers: TriggerDto[] | undefined; error: SubTabError | undefined }) {
  if (error) return <div className="p-4 text-xs text-red-600 dark:text-red-400">{error.message}</div>
  if (triggers === undefined) return <div className="p-4 text-xs text-slate-400">載入中…</div>
  if (triggers.length === 0) return <div className="p-4 text-xs text-slate-400 dark:text-slate-500">此表沒有觸發器。</div>
  return (
    <div className="h-full overflow-auto p-3 text-xs">
      <ul className="flex flex-col gap-2">
        {triggers.map((t) => (
          <li key={t.name} className="rounded border border-slate-200 dark:border-slate-800 p-2">
            <div className="flex items-center gap-2 font-mono">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{t.name}</span>
              <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 text-[10px] text-slate-500">{t.timing} {t.event}</span>
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-slate-600 dark:text-slate-400">{t.statement}</pre>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

Create `src/views/table/InfoTab.tsx`:

```tsx
import type { TableInfoDto } from '../../api/types'

interface SubTabError { code: string; message: string; status: number }

function fmtBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function InfoTab({ info, error }: { info: TableInfoDto | undefined; error: SubTabError | undefined }) {
  if (error) return <div className="p-4 text-xs text-red-600 dark:text-red-400">{error.message}</div>
  if (info === undefined) return <div className="p-4 text-xs text-slate-400">載入中…</div>
  const rows: Array<[string, string]> = [
    ['引擎', info.engine ?? '—'],
    ['字元集 / 定序', info.collation ?? '—'],
    ['列數(估計)', info.rowCount == null ? '—' : String(info.rowCount)],
    ['大小', fmtBytes(info.sizeBytes)],
    ['建立時間', info.createdAt ?? '—'],
  ]
  return (
    <div className="h-full overflow-auto p-3 text-xs">
      <table className="mb-4 text-left">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="py-1 pr-4 text-slate-400 dark:text-slate-500">{k}</td>
              <td className="py-1 font-mono text-slate-800 dark:text-slate-200">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mb-1 text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">建立語句</h3>
      {info.createSql ? (
        <pre className="overflow-auto rounded bg-slate-50 dark:bg-slate-800/60 p-2 font-mono text-[11px] text-slate-700 dark:text-slate-300">{info.createSql}</pre>
      ) : (
        <p className="text-slate-400 dark:text-slate-500">此系統不提供 CREATE 原文(可參考「結構」子頁籤)。</p>
      )}
    </div>
  )
}
```

Create `src/views/table/RelationsTab.tsx`:

```tsx
import type { RelationsDto } from '../../api/types'

interface SubTabError { code: string; message: string; status: number }

export function RelationsTab({ relations, error }: { relations: RelationsDto | undefined; error: SubTabError | undefined }) {
  if (error) return <div className="p-4 text-xs text-red-600 dark:text-red-400">{error.message}</div>
  if (relations === undefined) return <div className="p-4 text-xs text-slate-400">載入中…</div>
  const { forward, reverse } = relations
  if (forward.length === 0 && reverse.length === 0) {
    return <div className="p-4 text-xs text-slate-400 dark:text-slate-500">此表沒有關聯。</div>
  }
  return (
    <div className="h-full overflow-auto p-3 text-xs font-mono">
      <section className="mb-4">
        <h3 className="mb-1 text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">正向外鍵(本表 → 參照)</h3>
        {forward.length === 0 ? <p className="text-slate-400">(無)</p> : (
          <ul className="flex flex-col gap-0.5">
            {forward.map((r, i) => (
              <li key={`f-${i}`} className="text-slate-700 dark:text-slate-300">{r.fromColumn} → {r.toTable}.{r.toColumn}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">反向(被誰參照)</h3>
        {reverse.length === 0 ? <p className="text-slate-400">(無)</p> : (
          <ul className="flex flex-col gap-0.5">
            {reverse.map((r, i) => (
              <li key={`r-${i}`} className="text-slate-700 dark:text-slate-300">{r.fromTable}.{r.fromColumn} → 本表.{r.toColumn}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/frontend/table-subtabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/table/TriggersTab.tsx src/views/table/InfoTab.tsx src/views/table/RelationsTab.tsx tests/frontend/table-subtabs.test.tsx
git commit -m "feat: [frontend] Triggers/Info/Relations 子頁籤元件"
```

---

## Task 8: TableTab 容器(子頁籤列 + 開新查詢)

**Files:**
- Create: `src/views/TableTab.tsx`
- Test: `tests/frontend/TableTab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/TableTab.test.tsx`:

```tsx
import { test, expect, afterEach, mock } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TableTab } from '../../src/views/TableTab'
import type { TableSession } from '../../src/hooks/tabs-reducer'

afterEach(cleanup)

function session(over: Partial<TableSession> = {}): TableSession {
  return { connectionId: 'c1', table: 'orders', schema: { name: 'orders', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }], primaryKey: ['id'] }, subTab: 'structure', ...over }
}

const noop = () => {}
const baseProps = {
  permission: 'read-write' as const,
  saving: false,
  onSetSubTab: noop,
  onLoadSubTab: noop,
  onOpenQuery: noop,
  onSave: async () => true,
}

test('renders the five sub-tab buttons and the open-query button', () => {
  render(<TableTab session={session()} {...baseProps} />)
  for (const label of ['結構', '內容', '關聯', '觸發器', '資訊']) {
    expect(screen.getByRole('button', { name: label })).toBeDefined()
  }
  expect(screen.getByRole('button', { name: /以此表開新查詢/ })).toBeDefined()
})

test('clicking a sub-tab fires onSetSubTab + onLoadSubTab for lazy tabs', () => {
  const calls: string[] = []
  render(<TableTab session={session()} {...baseProps}
    onSetSubTab={(s) => calls.push(`set:${s}`)}
    onLoadSubTab={(k) => calls.push(`load:${k}`)} />)
  fireEvent.click(screen.getByRole('button', { name: '觸發器' }))
  expect(calls).toContain('set:triggers')
  expect(calls).toContain('load:triggers')
})

test('structure sub-tab does not trigger a lazy load', () => {
  const calls: string[] = []
  render(<TableTab session={session({ subTab: 'content' })} {...baseProps}
    onLoadSubTab={(k) => calls.push(k)} />)
  fireEvent.click(screen.getByRole('button', { name: '結構' }))
  expect(calls).toHaveLength(0)
})

test('open-query button fires onOpenQuery with a prefilled SELECT', () => {
  const opened: string[] = []
  render(<TableTab session={session()} {...baseProps} onOpenQuery={(sql) => opened.push(sql)} />)
  fireEvent.click(screen.getByRole('button', { name: /以此表開新查詢/ }))
  expect(opened[0]).toContain('SELECT * FROM orders')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/TableTab.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement TableTab**

Create `src/views/TableTab.tsx`:

```tsx
import { useEffect } from 'react'
import { SquarePen } from 'lucide-react'
import type { TableSession, LazyKey } from '../hooks/tabs-reducer'
import type { SubTab, MutateOps, Permission } from '../api/types'
import { StructureTab } from './table/StructureTab'
import { RelationsTab } from './table/RelationsTab'
import { TriggersTab } from './table/TriggersTab'
import { InfoTab } from './table/InfoTab'
import { TableBrowser } from './TableBrowser'

const TABS: Array<{ key: SubTab; label: string }> = [
  { key: 'structure', label: '結構' },
  { key: 'content', label: '內容' },
  { key: 'relations', label: '關聯' },
  { key: 'triggers', label: '觸發器' },
  { key: 'info', label: '資訊' },
]

const LAZY: Record<SubTab, LazyKey | null> = {
  structure: null, content: null, relations: 'relations', triggers: 'triggers', info: 'info',
}

export interface TableTabProps {
  session: TableSession
  permission: Permission
  saving: boolean
  onSetSubTab(subTab: SubTab): void
  onLoadSubTab(key: LazyKey): void
  onOpenQuery(sql: string): void
  onSave(ops: MutateOps): Promise<boolean> | void
}

export function TableTab({ session, permission, saving, onSetSubTab, onLoadSubTab, onOpenQuery, onSave }: TableTabProps) {
  const { subTab } = session

  // When the active sub-tab is lazy and uncached, fetch it (covers programmatic opens, e.g. edit flow).
  useEffect(() => {
    const key = LAZY[subTab]
    if (key && session[key] === undefined && !session.cacheErrors?.[key]) onLoadSubTab(key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, session.table])

  const selectTab = (key: SubTab) => {
    onSetSubTab(key)
    const lazy = LAZY[key]
    if (lazy && session[lazy] === undefined) onLoadSubTab(lazy)
  }

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-2">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={`px-3 py-2 text-xs transition-colors cursor-pointer border-b-2 ${
                subTab === t.key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onOpenQuery(`SELECT * FROM ${session.table} LIMIT 100`)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer"
        >
          <SquarePen className="h-3.5 w-3.5" /> 以此表開新查詢
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {subTab === 'structure' && <StructureTab schema={session.schema} />}
        {subTab === 'content' && (
          <TableBrowser
            table={session.table}
            schema={session.schema}
            rows={session.rows ?? []}
            columns={session.fields}
            permission={permission}
            saving={saving}
            onSave={onSave}
          />
        )}
        {subTab === 'relations' && <RelationsTab relations={session.relations} error={session.cacheErrors?.relations} />}
        {subTab === 'triggers' && <TriggersTab triggers={session.triggers} error={session.cacheErrors?.triggers} />}
        {subTab === 'info' && <InfoTab info={session.info} error={session.cacheErrors?.info} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/frontend/TableTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/TableTab.tsx tests/frontend/TableTab.test.tsx
git commit -m "feat: [frontend] TableTab 子頁籤容器 + 以此表開新查詢"
```

---

## Task 9: App.tsx 接 TableTab + Sidebar 互動

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/views/Sidebar.tsx`
- Test: `tests/frontend/Sidebar.test.tsx`

- [ ] **Step 1: Update Sidebar test**

Open `tests/frontend/Sidebar.test.tsx`. The Sidebar now opens a table tab on table-name click and on the pencil. Update the props used in the test harness: replace `onLoadColumns`/`expandedColumns`/`onBrowseTable` wiring with `onOpenTable`. Add/replace these tests (keep existing connection-related tests intact):

```tsx
test('clicking a table name fires onOpenTable(structure)', () => {
  const calls: Array<[string, string]> = []
  renderSidebar({ onOpenTable: (t: string, sub: string) => calls.push([t, sub]) })
  fireEvent.click(screen.getByRole('button', { name: /^orders/ }))
  expect(calls).toContainEqual(['orders', 'structure'])
})

test('clicking the pencil fires onOpenTable(content)', () => {
  const calls: Array<[string, string]> = []
  renderSidebar({ onOpenTable: (t: string, sub: string) => calls.push([t, sub]) })
  fireEvent.click(screen.getByRole('button', { name: '編輯資料 orders' }))
  expect(calls).toContainEqual(['orders', 'content'])
})
```

Adjust the `renderSidebar` helper in that file so the default props provide `onOpenTable: () => {}` and drop the removed `expandedColumns` / `onLoadColumns` / `onBrowseTable` props. (Inspect the file's existing helper and edit in place; keep the connection-list tests unchanged.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/Sidebar.test.tsx`
Expected: FAIL — `onOpenTable` not a prop; name click still calls old handler.

- [ ] **Step 3: Update Sidebar props + handlers**

In `src/views/Sidebar.tsx`:

Replace the three props `onLoadColumns`, `onBrowseTable`, and the `expandedColumns` field in `SidebarProps` with a single:

```ts
  onOpenTable(table: string, subTab: 'structure' | 'content'): void
```

(Remove `expandedColumns` from both the interface and the destructure on the first line of the component body.)

Change the table-name button's `onClick` (currently `props.onLoadColumns(t.name)`) to:

```tsx
                    onClick={() => props.onOpenTable(t.name, 'structure')}
```

Change the pencil button (`aria-label={`編輯資料 ${t.name}`}`) `onClick` from `props.onBrowseTable(t.name)` to:

```tsx
                    onClick={() => props.onOpenTable(t.name, 'content')}
```

Delete the inline column-expansion block — the entire `{columns ? ( ... ) : null}` JSX under each `<li>` and the `const columns = expandedColumns[t.name]` line. (The Structure sub-tab supersedes inline column expansion; documented spec decision #5.)

- [ ] **Step 4: Update App.tsx**

In `src/App.tsx`:

Add the import:

```ts
import { TableTab } from './views/TableTab'
```

Replace the Sidebar props block (the `<Sidebar ... />` call) — remove `expandedColumns`, `onLoadColumns`, `onBrowseTable`; add:

```tsx
            onOpenTable={app.openTableTab}
```

Replace the `active.browse ? ( ... ) : ( ... )` conditional. The new table-tab branch:

```tsx
          {active.table ? (
            <div className="flex-1 min-h-0">
              <TableTab
                session={active.table}
                permission={conn.permission ?? 'query-only'}
                saving={app.saving}
                onSetSubTab={(s) => tabs.setSubTab(tabs.activeId, s)}
                onLoadSubTab={(k) => app.loadSubTab(tabs.activeId, k)}
                onOpenQuery={(sql) => { tabs.openTab(); tabs.loadSql(sql) }}
                onSave={(ops) => app.saveTableEdits(active.table!.table, ops)}
              />
            </div>
          ) : (
```

(The `: (` opens the existing query-editor `<>...</>` fragment — leave that block unchanged, just ensure the closing `)}` still matches.)

- [ ] **Step 5: Run the full frontend suite**

Run: `bun test tests/frontend/`
Expected: PASS (all). Then `bunx tsc --noEmit` — expected: clean (no errors anywhere).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/views/Sidebar.tsx tests/frontend/Sidebar.test.tsx
git commit -m "feat: [frontend] App 接 TableTab;側欄表名/鉛筆開表分頁"
```

---

## Task 10: E2E — 點表開分頁 → 切五子頁籤 → 開新查詢

**Files:**
- Create: `tests/e2e/journeys/table-tabs.e2e.ts`
- Modify: `tests/e2e/fixtures/adapter.ts` (讓 fixture 回 trigger/relation/info 列)

- [ ] **Step 1: Extend the fixture adapter so detail queries return data**

In `tests/e2e/fixtures/adapter.ts`, replace the SELECT branch of `execute` so detail queries answer with sample rows. Replace the final SELECT fallback (the block after the INSERT/UPDATE/DELETE check) with:

```ts
      if (sql.includes('information_schema.TRIGGERS') || sql.includes('information_schema.triggers')) {
        return { rows: [{ name: 'trg_demo', timing: 'AFTER', event: 'INSERT', statement: 'BEGIN END' }] as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
      }
      if (sql.includes('KEY_COLUMN_USAGE') || sql.includes('constraint_column_usage')) {
        return { rows: [{ fromTable: 'order_items', fromColumn: 'order_id', toColumn: 'id', constraintName: 'fk_oi' }] as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
      }
      if (sql.startsWith('SHOW CREATE TABLE')) {
        return { rows: [{ Table: 'orders', 'Create Table': 'CREATE TABLE `orders` (...)' }] as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
      }
      if (sql.includes('information_schema.TABLES')) {
        return { rows: [{ engine: 'InnoDB', rowCount: 3, sizeBytes: 16384, collation: 'utf8mb4_general_ci', createdAt: '2024-01-01' }] as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
      }
      // plain SELECT → seed rows
      const t = tables.find((tb) => new RegExp(`\\b${tb.name}\\b`).test(sql))
      return { rows: (t?.rows ?? []) as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
```

- [ ] **Step 2: Write the E2E journey**

Create `tests/e2e/journeys/table-tabs.e2e.ts`:

```ts
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
```

- [ ] **Step 3: Run the E2E journey**

Run: `bun run e2e tests/e2e/journeys/table-tabs.e2e.ts --workers=1`
Expected: PASS. (Use `--workers=1` per the project's e2e note.)

- [ ] **Step 4: Run the full E2E suite for regressions**

Run: `bun run e2e --workers=1`
Expected: PASS, except the 2 known export-download tests that fail under headless Chromium (pre-existing env limitation, not a regression).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/journeys/table-tabs.e2e.ts tests/e2e/fixtures/adapter.ts
git commit -m "test: [e2e] 表分頁五子頁籤 + 以此表開新查詢流程"
```

---

## Task 11: 全量回歸 + 文件

**Files:**
- Modify: `README.md`(v2 段落補「表格多頁籤」一節)

- [ ] **Step 1: Full test sweep**

Run: `bun test`
Expected: PASS (whole suite).

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Document the feature**

In `README.md`, under the existing v2 section, add a short subsection describing: 點側欄表名開「表分頁」(結構/內容/關聯/觸發器/資訊),鉛筆直接進內容編輯,工具列「以此表開新查詢」預填 `SELECT * FROM <表>`;觸發器/資訊/關聯首次切入才抓並快取於分頁;僅支援 SQL 三系統(MySQL/MariaDB/PostgreSQL)。Keep it to one paragraph matching the surrounding style.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: [v2] README 補表格多頁籤(子頁籤)說明"
```

---

## Self-Review Notes

- **Spec coverage:** 方言三系統 SQL builder(Task 1)✓;triggers/info/relations 端點 + blacklist + NOT_OPEN(Task 2)✓;TableSession + lazy 快取(Task 4)✓;五子頁籤(結構 Task 6、觸發器/資訊/關聯 Task 7、內容沿用 TableBrowser via Task 8)✓;以此表開新查詢(Task 8/9)✓;側欄表名/鉛筆互動(Task 9)✓;lazy 載入 + 每子頁籤 inline 錯誤(Task 5/7/8)✓;E2E(Task 10)✓;非目標(無 schema 編輯、無 ER 圖、僅 SQL)皆未實作 ✓。
- **Deviation from spec:** `kind` 判別聯集 → 改用 `QuerySession.table` 旗標(header 已載明)。正向關聯由後端 `/schema/relations` 一併回(spec 允許「正向也可一併回」),避免動 `/schema/table` 與 `TableSchemaDto`。
- **Type consistency:** `dialectFor`/`TableDialect`(triggers/reverseRelations/info/createTable);`makeTableDetailHandlers`→`{triggers,info,relations}`;client `tableTriggers/tableInfo/tableRelations`;reducer actions `openTableTab/setTableRows/setSubTab/setTableCache/setSubTabError`;`SubTab`/`LazyKey` 一致沿用。
- **PostgreSQL info/createTable:** 蓄意回 `createSql=null` + 結構摘要(YAGNI;header「全域約定」與 InfoTab 空狀態已對應)。
```
