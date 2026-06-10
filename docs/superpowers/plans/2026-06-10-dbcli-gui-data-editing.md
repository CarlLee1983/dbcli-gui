# dbcli-gui — 資料編輯子系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 dbcli-gui 內提供「表瀏覽 + 行內編輯/新增/刪除 → 暫存 → 一次交易寫回」的資料編輯能力,sidecar 重用 core 的 `DataExecutor`(權限/blacklist/方言守門),前端以顯式編輯模式防呆。

**Architecture:** 三層。sidecar 新增 `POST /data/mutate`(交易包裹批次 op、樂觀並發、權限/blacklist 守門),`/connections/open` 回應補 `permission`。前端新增 `TableBrowser` 視圖 + `useDataEdit` 暫存模型 + `api` 擴充。SQL 方言知識全在 core `DataExecutor`,sidecar 僅編排交易,前端僅做表單與呼叫。

**Tech Stack:** Bun、TypeScript、React 19、Tailwind 4、zod v3、Playwright(E2E)、`@carllee1983/dbcli@^1.31.0`。

**Repo:** `/Users/carl/Dev/CMG/dbcli-gui`。前置:core 計畫(`2026-06-10-dbcli-core-data-executor-export.md`)需先完成並發 1.31.0(或本地 `bun link` 對接 1.31.0)。

**已確認決策(來自 spec):** 暗放改動 + 手動儲存;顯式編輯模式開關;階段一只做表瀏覽(任意 SQL 結果唯讀,單表偵測留階段二);DELETE 需 `data-admin`/`admin`、INSERT/UPDATE 需 `read-write`+。

---

## 階段 B — sidecar

### Task B1: 升級 dbcli 依賴到 1.31.0

**Files:**
- Modify: `package.json`

- [ ] **Step 1: bump 依賴**

編輯 `package.json`,把 `@carllee1983/dbcli` 的版本改為 `^1.31.0`。

- [ ] **Step 2: 安裝(拉取 npm 1.31.0,覆蓋舊 dev symlink)**

Run: `bun install`
Expected: `bun.lock` 更新為 1.31.0;若 npm 尚未發布,改用 `bun link @carllee1983/dbcli` 對接本地 core 1.31.0。

- [ ] **Step 3: 驗證新匯出可解析**

Run: `bun -e "import('@carllee1983/dbcli/core').then(m => console.log(typeof m.DataExecutor))"`
Expected: 印出 `function`。

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: [gui] bump @carllee1983/dbcli 依賴至 ^1.31.0 (DataExecutor)"
```

---

### Task B2: MutateBody zod schema

**Files:**
- Modify: `shared/schemas.ts`
- Test: `tests/sidecar/mutate-schema.test.ts`

- [ ] **Step 1: 寫會失敗的 schema 測試**

建立 `tests/sidecar/mutate-schema.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { MutateBody } from '../../shared/schemas'

test('accepts a well-formed batch', () => {
  const r = MutateBody.safeParse({
    connectionId: 'main', table: 'users',
    ops: {
      updates: [{ pk: { id: 1 }, set: { name: 'a' } }],
      inserts: [{ values: { name: 'b' } }],
      deletes: [{ pk: { id: 2 } }],
    },
  })
  expect(r.success).toBe(true)
})

test('defaults missing op arrays to empty', () => {
  const r = MutateBody.safeParse({ connectionId: 'main', table: 'users', ops: {} })
  expect(r.success).toBe(true)
  if (r.success) {
    expect(r.data.ops.updates).toEqual([])
    expect(r.data.ops.inserts).toEqual([])
    expect(r.data.ops.deletes).toEqual([])
  }
})

test('rejects empty table', () => {
  const r = MutateBody.safeParse({ connectionId: 'main', table: '', ops: {} })
  expect(r.success).toBe(false)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/mutate-schema.test.ts`
Expected: FAIL —「MutateBody is not exported」。

- [ ] **Step 3: 在 shared/schemas.ts 加 schema**

在檔尾(`TestConnectionBody` 型別匯出之後)加:

```ts
const RowValues = z.record(z.string(), z.unknown())

export const MutateBody = z.object({
  connectionId: z.string().min(1),
  table: z.string().min(1),
  ops: z.object({
    updates: z.array(z.object({ pk: RowValues, set: RowValues })).default([]),
    inserts: z.array(z.object({ values: RowValues })).default([]),
    deletes: z.array(z.object({ pk: RowValues })).default([]),
  }),
})

export type MutateBody = z.infer<typeof MutateBody>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/mutate-schema.test.ts`
Expected: PASS(3 個 test 全綠)。

- [ ] **Step 5: Commit**

```bash
git add shared/schemas.ts tests/sidecar/mutate-schema.test.ts
git commit -m "feat: [sidecar] MutateBody schema for batch data edits"
```

---

### Task B3: `/data/mutate` 路由處理器

**Files:**
- Create: `sidecar/routes/data.ts`
- Test: `tests/sidecar/data-route.test.ts`

- [ ] **Step 1: 寫會失敗的路由測試**

建立 `tests/sidecar/data-route.test.ts`:

```ts
import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

const SCHEMA = {
  name: 'users',
  columns: [
    { name: 'id', type: 'int', nullable: false, primaryKey: true },
    { name: 'name', type: 'text', nullable: true },
    { name: 'ssn', type: 'text', nullable: true },
  ],
  primaryKey: ['id'],
}

function cfg(over: Partial<{ permission: string; blacklist: unknown }> = {}): DbcliConfig {
  return {
    connection: { system: 'postgresql' },
    permission: over.permission ?? 'data-admin',
    blacklist: over.blacklist ?? { tables: [], columns: {} },
  } as unknown as DbcliConfig
}

function recordingAdapter(affected = 1): { adapter: DatabaseAdapter; calls: string[] } {
  const calls: string[] = []
  const adapter = {
    connect: async () => {},
    disconnect: async () => {},
    execute: async (sql: string) => { calls.push(sql.split(' ')[0]); return { rows: [], affectedRows: affected } },
    getTableSchema: async () => SCHEMA,
  } as unknown as DatabaseAdapter
  return { adapter, calls }
}

let server: ReturnType<typeof createServer> | undefined
afterEach(async () => { await server?.stop(true) })

function start(config: DbcliConfig, rec = recordingAdapter()) {
  const pool = new ConnectionPool({ loadConfig: async () => config, openAdapter: () => rec.adapter })
  server = createServer({ pool, token: 'test', port: 0, dbcliPath: '/tmp/dbcli-gui-unused' })
  return { server, calls: rec.calls }
}
const post = (s: ReturnType<typeof createServer>, path: string, body: unknown) =>
  fetch(`http://localhost:${s.port}${path}`, { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('batch update+insert+delete commits and reports counts', async () => {
  const { server: s, calls } = start(cfg())
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', {
    connectionId: 'main', table: 'users',
    ops: { updates: [{ pk: { id: 1 }, set: { name: 'x' } }], inserts: [{ values: { name: 'y' } }], deletes: [{ pk: { id: 2 } }] },
  })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, applied: { updated: 1, inserted: 1, deleted: 1 } })
  expect(calls).toContain('BEGIN')
  expect(calls).toContain('COMMIT')
})

test('query-only permission rejects writes with 403 PERMISSION', async () => {
  const { server: s } = start(cfg({ permission: 'query-only' }))
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', { connectionId: 'main', table: 'users', ops: { updates: [{ pk: { id: 1 }, set: { name: 'x' } }] } })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('PERMISSION')
})

test('read-write permission rejects deletes with 403 PERMISSION', async () => {
  const { server: s } = start(cfg({ permission: 'read-write' }))
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', { connectionId: 'main', table: 'users', ops: { deletes: [{ pk: { id: 1 } }] } })
  expect(res.status).toBe(403)
})

test('blacklisted table is rejected', async () => {
  const { server: s } = start(cfg({ blacklist: { tables: ['users'], columns: {} } }))
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', { connectionId: 'main', table: 'users', ops: { inserts: [{ values: { name: 'y' } }] } })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('BLACKLISTED')
})

test('writing a blacklisted column is rejected', async () => {
  const { server: s } = start(cfg({ blacklist: { tables: [], columns: { users: ['ssn'] } } }))
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', { connectionId: 'main', table: 'users', ops: { updates: [{ pk: { id: 1 }, set: { ssn: '123' } }] } })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('BLACKLISTED')
})

test('affectedRows !== 1 on update rolls back with 409 CONFLICT', async () => {
  const { server: s, calls } = start(cfg(), recordingAdapter(0))
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', { connectionId: 'main', table: 'users', ops: { updates: [{ pk: { id: 99 }, set: { name: 'x' } }] } })
  expect(res.status).toBe(409)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('CONFLICT')
  expect(calls).toContain('ROLLBACK')
})

test('mutate on unopened connection returns 409 NOT_OPEN', async () => {
  const { server: s } = start(cfg())
  const res = await post(s, '/data/mutate', { connectionId: 'missing', table: 'users', ops: { inserts: [{ values: { name: 'y' } }] } })
  expect(res.status).toBe(409)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('NOT_OPEN')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/data-route.test.ts`
Expected: FAIL(`/data/mutate` 尚未註冊 → 404,或 import 失敗)。

- [ ] **Step 3: 寫路由處理器**

建立 `sidecar/routes/data.ts`:

```ts
import { BlacklistManager, BlacklistValidator, DataExecutor, BlacklistError } from '@carllee1983/dbcli/core'
import type { Permission } from '@carllee1983/dbcli/core'
import type { ConnectionPool } from '../connection-pool'
import { MutateBody } from '../../shared/schemas'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { json } from '../http'

/** Optimistic-concurrency violation: an update/delete matched ≠1 row. */
class ConflictError extends Error {}

function dialectFor(system: string): 'postgresql' | 'mysql' {
  return system === 'postgresql' ? 'postgresql' : 'mysql'
}

export function makeDataHandlers(pool: ConnectionPool) {
  return {
    async mutate(req: Request): Promise<Response> {
      const parsed = MutateBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId + table + ops required' } }, 400)

      const { connectionId, table, ops } = parsed.data
      const entry = pool.get(connectionId)
      if (!entry) return json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409)

      const permission = ((entry.config as { permission?: Permission }).permission ?? 'query-only')
      const wantsWrite = ops.updates.length > 0 || ops.inserts.length > 0
      const wantsDelete = ops.deletes.length > 0

      if (!wantsWrite && !wantsDelete) return json({ error: { code: 'BAD_REQUEST', message: 'no operations provided' } }, 400)
      if (wantsWrite && permission === 'query-only')
        return json({ error: { code: 'PERMISSION', message: 'read-write permission required to modify data' } }, 403)
      if (wantsDelete && permission !== 'data-admin' && permission !== 'admin')
        return json({ error: { code: 'PERMISSION', message: 'data-admin permission required to delete rows' } }, 403)

      const manager = new BlacklistManager(entry.config)
      if (manager.isTableBlacklisted(table)) {
        const body = toErrorBody(new BlacklistError(`${table} is protected`, table, 'data'))
        return json(body, statusForCode(body.error.code))
      }
      const blacklistedCols = new Set(manager.getBlacklistedColumns(table))
      const touched = [
        ...ops.updates.flatMap((u) => Object.keys(u.set)),
        ...ops.inserts.flatMap((i) => Object.keys(i.values)),
      ]
      const hit = touched.find((c) => blacklistedCols.has(c))
      if (hit) {
        const body = toErrorBody(new BlacklistError(`${table}.${hit} is protected`, table, 'data'))
        return json(body, statusForCode(body.error.code))
      }

      const dialect = dialectFor((entry.config.connection as { system: string }).system)
      const validator = new BlacklistValidator(manager)
      const executor = new DataExecutor(entry.adapter, permission, dialect, validator)

      try {
        const schema = await entry.adapter.getTableSchema(table)
        if (!schema) return json({ error: { code: 'NOT_FOUND', message: `table ${table} not found` } }, 404)

        await entry.adapter.execute('BEGIN')
        let updated = 0, inserted = 0, deleted = 0
        try {
          for (const d of ops.deletes) {
            const r = await executor.executeDelete(table, d.pk, schema, { force: true })
            if (r.status === 'error') throw new Error(r.error ?? 'delete failed')
            if (r.rows_affected !== 1) throw new ConflictError()
            deleted += r.rows_affected
          }
          for (const u of ops.updates) {
            const r = await executor.executeUpdate(table, u.set, u.pk, schema, { force: true })
            if (r.status === 'error') throw new Error(r.error ?? 'update failed')
            if (r.rows_affected !== 1) throw new ConflictError()
            updated += r.rows_affected
          }
          for (const i of ops.inserts) {
            const r = await executor.executeInsert(table, i.values, schema, { force: true })
            if (r.status === 'error') throw new Error(r.error ?? 'insert failed')
            inserted += r.rows_affected
          }
          await entry.adapter.execute('COMMIT')
        } catch (txErr) {
          await entry.adapter.execute('ROLLBACK').catch(() => {})
          throw txErr
        }
        return json({ ok: true, applied: { updated, inserted, deleted } })
      } catch (err) {
        if (err instanceof ConflictError)
          return json({ error: { code: 'CONFLICT', message: 'row was modified or removed by another process' } }, 409)
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },
  }
}
```

> 註:`DataExecutor` 在 headless 環境必須傳 `{ force: true }` 跳過互動式 `promptUser.confirm`;其內部亦會自行 `enforcePermission` 與 blacklist 檢查(本路由的前置守門為 defense-in-depth,並負責回對應 HTTP 狀態)。

- [ ] **Step 4: 在 Task B4 註冊路由後再跑此測試**(此步先略過,待 B4)

---

### Task B4: 註冊 `/data/mutate` 路由

**Files:**
- Modify: `sidecar/server.ts`

- [ ] **Step 1: import 與註冊**

在 `sidecar/server.ts` 的 import 區(其他 `make*Handlers` 旁)加:

```ts
import { makeDataHandlers } from './routes/data'
```

在 `createServer` 內、建立其他 handler 之處(如 `const schema = makeSchemaHandlers(deps.pool)` 附近)加:

```ts
const data = makeDataHandlers(deps.pool)
```

在 `routes: { ... }` 物件中(`'/export'` 那行附近)加:

```ts
      '/data/mutate': post(data.mutate),
```

- [ ] **Step 2: 跑 B3 的路由測試確認全綠**

Run: `bun test tests/sidecar/data-route.test.ts`
Expected: PASS(7 個 test 全綠)。

- [ ] **Step 3: 跑全 sidecar 測試確認未回歸**

Run: `bun test tests/sidecar/`
Expected: ALL PASS。

- [ ] **Step 4: Commit**

```bash
git add sidecar/routes/data.ts sidecar/server.ts tests/sidecar/data-route.test.ts
git commit -m "feat: [sidecar] POST /data/mutate — 交易批次資料編輯 (權限/blacklist/並發守門)"
```

---

### Task B5: `/connections/open` 回應補 `permission`

**Files:**
- Modify: `sidecar/routes/connections.ts`
- Test: `tests/sidecar/connections-route.test.ts`

- [ ] **Step 1: 在既有 open 測試檔加一個會失敗的斷言**

在 `tests/sidecar/connections-route.test.ts` 新增 test(沿用該檔既有的 server/pool 啟動方式;若該檔已有 `start`/`post` 輔助,直接重用;以下為自含版本):

```ts
import { test as openTest, expect as openExpect } from 'bun:test'
import { createServer as mkServer } from '../../sidecar/server'
import { ConnectionPool as Pool } from '../../sidecar/connection-pool'
import type { DbcliConfig as Cfg } from '@carllee1983/dbcli/core'

openTest('open returns the connection permission', async () => {
  const config = { connection: { system: 'mysql' }, permission: 'read-write' } as unknown as Cfg
  const pool = new Pool({ loadConfig: async () => config, openAdapter: () => ({ connect: async () => {}, disconnect: async () => {} }) as never })
  const s = mkServer({ pool, token: 't', port: 0, dbcliPath: '/tmp/dbcli-gui-unused' })
  try {
    const res = await fetch(`http://localhost:${s.port}/connections/open`, {
      method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ connectionId: 'main' }),
    })
    openExpect(res.status).toBe(200)
    openExpect(await res.json()).toEqual({ ok: true, system: 'mysql', permission: 'read-write' })
  } finally {
    await s.stop(true)
  }
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/connections-route.test.ts`
Expected: FAIL —回應缺 `permission` 欄位。

- [ ] **Step 3: 修改 open handler**

在 `sidecar/routes/connections.ts` 的 open handler,把回傳那行:

```ts
return json({ ok: true, system: (entry.config.connection as { system: string }).system })
```

改為:

```ts
return json({
  ok: true,
  system: (entry.config.connection as { system: string }).system,
  permission: (entry.config as { permission?: string }).permission ?? 'query-only',
})
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/connections-route.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add sidecar/routes/connections.ts tests/sidecar/connections-route.test.ts
git commit -m "feat: [sidecar] open 回應補 permission 欄位 (供前端編輯模式守門)"
```

---

## 階段 C — 前端

### Task C1: api 型別擴充

**Files:**
- Modify: `src/api/types.ts`

- [ ] **Step 1: 加型別**

在 `src/api/types.ts` 檔尾加:

```ts
export type Permission = 'query-only' | 'read-write' | 'data-admin' | 'admin'

export interface MutateOps {
  updates: Array<{ pk: Record<string, unknown>; set: Record<string, unknown> }>
  inserts: Array<{ values: Record<string, unknown> }>
  deletes: Array<{ pk: Record<string, unknown> }>
}

export interface MutateResult {
  ok: boolean
  applied: { updated: number; inserted: number; deleted: number }
}
```

- [ ] **Step 2: 確認型別檢查通過**

Run: `bunx tsc --noEmit`
Expected: 無錯誤。

- [ ] **Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat: [frontend] data-edit api 型別 (MutateOps/MutateResult/Permission)"
```

---

### Task C2: api client 擴充 mutate + open permission

**Files:**
- Modify: `src/api/client.ts`
- Test: `tests/frontend/client.test.ts`

- [ ] **Step 1: 寫會失敗的 client 測試**

在 `tests/frontend/client.test.ts` 加(沿用該檔既有的 fetch mock 風格;以下為自含版本,使用全域 fetch stub):

```ts
import { test as ct, expect as ce, afterEach as ca } from 'bun:test'
import { makeClient } from '../../src/api/client'

const realFetch = globalThis.fetch
ca(() => { globalThis.fetch = realFetch })

ct('mutate posts ops and returns applied counts', async () => {
  let captured: { url: string; body: unknown } | null = null
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    captured = { url: String(url), body: JSON.parse(String(init?.body)) }
    return new Response(JSON.stringify({ ok: true, applied: { updated: 1, inserted: 0, deleted: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  const client = makeClient('http://x', 'tok')
  const ops = { updates: [{ pk: { id: 1 }, set: { name: 'a' } }], inserts: [], deletes: [] }
  const res = await client.mutate('main', 'users', ops)
  ce(res.applied.updated).toBe(1)
  ce(captured!.url).toBe('http://x/data/mutate')
  ce(captured!.body).toEqual({ connectionId: 'main', table: 'users', ops })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/client.test.ts`
Expected: FAIL —`client.mutate is not a function`。

- [ ] **Step 3: 擴充 DbClient 介面與實作**

在 `src/api/client.ts`:

(a) import 區加型別:

```ts
import type {
  ConnectionSummary, QueryResultDto, TreeTable, TableSchemaDto,
  ConnectionFormInput, ConnectionDetail, TestResult,
  MutateOps, MutateResult, Permission,
} from './types'
```

(b) `DbClient` 介面內,把 `openConnection` 改為回傳 permission,並新增 `mutate`:

```ts
  openConnection(id: string): Promise<{ ok: boolean; system: string; permission: Permission }>
  mutate(id: string, table: string, ops: MutateOps): Promise<MutateResult>
```

(c) 實作物件內,更新 `openConnection` 的型別轉型,並加 `mutate`:

```ts
    openConnection: (id) => post('/connections/open', { connectionId: id }) as Promise<{ ok: boolean; system: string; permission: Permission }>,
    mutate: (id, table, ops) => post('/data/mutate', { connectionId: id, table, ops }) as Promise<MutateResult>,
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/client.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts tests/frontend/client.test.ts
git commit -m "feat: [frontend] api client.mutate + open 回傳 permission"
```

---

### Task C3: 暫存改動純邏輯 + useDataEdit hook

**Files:**
- Create: `src/hooks/data-edit.ts`
- Create: `src/hooks/useDataEdit.ts`
- Test: `tests/frontend/data-edit.test.ts`

- [ ] **Step 1: 寫會失敗的純邏輯測試**

建立 `tests/frontend/data-edit.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { rowKeyOf, pendingCount, buildMutateOps, emptyEdits, reduceEdits } from '../../src/hooks/data-edit'

const PK = ['id']
const rows = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]
const byKey = Object.fromEntries(rows.map((r) => [rowKeyOf(r, PK), r]))

test('rowKeyOf is stable for the same pk values', () => {
  expect(rowKeyOf({ id: 1, name: 'z' }, PK)).toBe(rowKeyOf({ id: 1, name: 'a' }, PK))
})

test('setCell accumulates an update; pendingCount reflects it', () => {
  let e = emptyEdits()
  e = reduceEdits(e, { type: 'setCell', key: rowKeyOf(rows[0], PK), field: 'name', value: 'x' })
  expect(pendingCount(e)).toBe(1)
  const ops = buildMutateOps(e, byKey, PK)
  expect(ops.updates).toEqual([{ pk: { id: 1 }, set: { name: 'x' } }])
})

test('two edits to the same row merge into one update', () => {
  let e = emptyEdits()
  const k = rowKeyOf(rows[0], PK)
  e = reduceEdits(e, { type: 'setCell', key: k, field: 'name', value: 'x' })
  e = reduceEdits(e, { type: 'setCell', key: k, field: 'name', value: 'y' })
  expect(pendingCount(e)).toBe(1)
  expect(buildMutateOps(e, byKey, PK).updates[0].set).toEqual({ name: 'y' })
})

test('toggleDelete adds then removes a delete', () => {
  let e = emptyEdits()
  const k = rowKeyOf(rows[1], PK)
  e = reduceEdits(e, { type: 'toggleDelete', key: k })
  expect(buildMutateOps(e, byKey, PK).deletes).toEqual([{ pk: { id: 2 } }])
  e = reduceEdits(e, { type: 'toggleDelete', key: k })
  expect(pendingCount(e)).toBe(0)
})

test('insert draft flows into ops.inserts', () => {
  let e = emptyEdits()
  e = reduceEdits(e, { type: 'addInsert' })
  e = reduceEdits(e, { type: 'setInsertCell', index: 0, field: 'name', value: 'new' })
  expect(buildMutateOps(e, byKey, PK).inserts).toEqual([{ values: { name: 'new' } }])
})

test('null value is preserved through ops', () => {
  let e = emptyEdits()
  e = reduceEdits(e, { type: 'setCell', key: rowKeyOf(rows[0], PK), field: 'name', value: null })
  expect(buildMutateOps(e, byKey, PK).updates[0].set).toEqual({ name: null })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/data-edit.test.ts`
Expected: FAIL —模組不存在。

- [ ] **Step 3: 寫純邏輯模組**

建立 `src/hooks/data-edit.ts`:

```ts
export interface PendingEdits {
  updates: Record<string, Record<string, unknown>>
  inserts: Array<Record<string, unknown>>
  deletes: string[]
}

export const emptyEdits = (): PendingEdits => ({ updates: {}, inserts: [], deletes: [] })

export function rowKeyOf(row: Record<string, unknown>, primaryKey: string[]): string {
  return JSON.stringify(primaryKey.map((k) => row[k]))
}

export function pendingCount(e: PendingEdits): number {
  return Object.keys(e.updates).length + e.inserts.length + e.deletes.length
}

export interface MutateOps {
  updates: Array<{ pk: Record<string, unknown>; set: Record<string, unknown> }>
  inserts: Array<{ values: Record<string, unknown> }>
  deletes: Array<{ pk: Record<string, unknown> }>
}

export function buildMutateOps(
  edits: PendingEdits,
  rowsByKey: Record<string, Record<string, unknown>>,
  primaryKey: string[],
): MutateOps {
  const pkOf = (row: Record<string, unknown>) => Object.fromEntries(primaryKey.map((k) => [k, row[k]]))
  return {
    deletes: edits.deletes.filter((k) => !!rowsByKey[k]).map((k) => ({ pk: pkOf(rowsByKey[k]) })),
    updates: Object.entries(edits.updates).filter(([k]) => !!rowsByKey[k]).map(([k, set]) => ({ pk: pkOf(rowsByKey[k]), set })),
    inserts: edits.inserts.map((values) => ({ values })),
  }
}

export type EditAction =
  | { type: 'setCell'; key: string; field: string; value: unknown }
  | { type: 'toggleDelete'; key: string }
  | { type: 'addInsert' }
  | { type: 'setInsertCell'; index: number; field: string; value: unknown }
  | { type: 'removeInsert'; index: number }
  | { type: 'reset' }

export function reduceEdits(state: PendingEdits, action: EditAction): PendingEdits {
  switch (action.type) {
    case 'setCell':
      return { ...state, updates: { ...state.updates, [action.key]: { ...state.updates[action.key], [action.field]: action.value } } }
    case 'toggleDelete': {
      const has = state.deletes.includes(action.key)
      return { ...state, deletes: has ? state.deletes.filter((k) => k !== action.key) : [...state.deletes, action.key] }
    }
    case 'addInsert':
      return { ...state, inserts: [...state.inserts, {}] }
    case 'setInsertCell':
      return { ...state, inserts: state.inserts.map((row, i) => (i === action.index ? { ...row, [action.field]: action.value } : row)) }
    case 'removeInsert':
      return { ...state, inserts: state.inserts.filter((_, i) => i !== action.index) }
    case 'reset':
      return emptyEdits()
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/data-edit.test.ts`
Expected: PASS(6 個 test 全綠)。

- [ ] **Step 5: 寫 useDataEdit hook(薄包 useReducer)**

建立 `src/hooks/useDataEdit.ts`:

```ts
import { useReducer } from 'react'
import { emptyEdits, reduceEdits, type EditAction, type PendingEdits } from './data-edit'

export interface DataEditApi {
  edits: PendingEdits
  setCell(key: string, field: string, value: unknown): void
  toggleDelete(key: string): void
  addInsert(): void
  setInsertCell(index: number, field: string, value: unknown): void
  removeInsert(index: number): void
  reset(): void
}

export function useDataEdit(): DataEditApi {
  const [edits, dispatch] = useReducer((s: PendingEdits, a: EditAction) => reduceEdits(s, a), undefined, emptyEdits)
  return {
    edits,
    setCell: (key, field, value) => dispatch({ type: 'setCell', key, field, value }),
    toggleDelete: (key) => dispatch({ type: 'toggleDelete', key }),
    addInsert: () => dispatch({ type: 'addInsert' }),
    setInsertCell: (index, field, value) => dispatch({ type: 'setInsertCell', index, field, value }),
    removeInsert: (index) => dispatch({ type: 'removeInsert', index }),
    reset: () => dispatch({ type: 'reset' }),
  }
}
```

- [ ] **Step 6: 型別檢查 + Commit**

Run: `bunx tsc --noEmit`
Expected: 無錯誤。

```bash
git add src/hooks/data-edit.ts src/hooks/useDataEdit.ts tests/frontend/data-edit.test.ts
git commit -m "feat: [frontend] useDataEdit 暫存改動模型 (updates/inserts/deletes + buildMutateOps)"
```

---

### Task C4: TableBrowser 視圖(表瀏覽 + 編輯模式)

**Files:**
- Create: `src/views/TableBrowser.tsx`
- Test: `tests/frontend/TableBrowser.test.tsx`

> MVP:以單一可捲動 `<table>` 渲染(`LIMIT 200`),不做虛擬捲動(虛擬捲動整合留 Phase D 跟進,沿用 `grid-virtual.ts`)。著重編輯模式切換、改動標記、NULL 編輯、儲存/取消呼叫。

- [ ] **Step 1: 寫會失敗的元件測試**

建立 `tests/frontend/TableBrowser.test.tsx`:

```tsx
import { test, expect, afterEach } from 'bun:test'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { TableBrowser } from '../../src/views/TableBrowser'
import type { TableSchemaDto } from '../../src/api/types'

afterEach(cleanup)

const schema: TableSchemaDto = {
  name: 'users',
  columns: [
    { name: 'id', type: 'int', nullable: false, primaryKey: true },
    { name: 'name', type: 'text', nullable: true },
  ],
  primaryKey: ['id'],
}
const rows = [{ id: 1, name: 'alice' }, { id: 2, name: 'bob' }]

function setup(over: Partial<React.ComponentProps<typeof TableBrowser>> = {}) {
  const calls = { save: [] as unknown[] }
  const utils = render(
    <TableBrowser
      table="users"
      schema={schema}
      rows={rows}
      permission="data-admin"
      saving={false}
      onSave={(ops) => { calls.save.push(ops) }}
      {...over}
    />,
  )
  return { ...utils, calls }
}

test('renders rows read-only by default (no inputs)', () => {
  const { container } = setup()
  expect(container.querySelectorAll('input').length).toBe(0)
})

test('entering edit mode reveals editable cells', () => {
  const { getByRole, container } = setup()
  fireEvent.click(getByRole('button', { name: '編輯' }))
  expect(container.querySelectorAll('input').length).toBeGreaterThan(0)
})

test('edit mode is disabled when permission is query-only', () => {
  const { getByRole } = setup({ permission: 'query-only' })
  expect((getByRole('button', { name: '編輯' }) as HTMLButtonElement).disabled).toBe(true)
})

test('disables editing and shows a banner when table has no primary key', () => {
  const { getByText, getByRole } = setup({ schema: { ...schema, primaryKey: [] } })
  expect(getByText(/無主鍵/)).toBeDefined()
  expect((getByRole('button', { name: '編輯' }) as HTMLButtonElement).disabled).toBe(true)
})

test('editing a cell then saving emits ops', () => {
  const { getByRole, getByLabelText, calls } = setup()
  fireEvent.click(getByRole('button', { name: '編輯' }))
  fireEvent.change(getByLabelText('編輯 name 第 1 列'), { target: { value: 'ALICE' } })
  fireEvent.click(getByRole('button', { name: /儲存/ }))
  expect(calls.save).toEqual([{ updates: [{ pk: { id: 1 }, set: { name: 'ALICE' } }], inserts: [], deletes: [] }])
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/TableBrowser.test.tsx`
Expected: FAIL —元件不存在。

- [ ] **Step 3: 實作 TableBrowser**

建立 `src/views/TableBrowser.tsx`:

```tsx
import { useState } from 'react'
import type { TableSchemaDto, MutateOps, Permission } from '../api/types'
import { useDataEdit } from '../hooks/useDataEdit'
import { buildMutateOps, rowKeyOf, pendingCount } from '../hooks/data-edit'

export interface TableBrowserProps {
  table: string
  schema: TableSchemaDto
  rows: Array<Record<string, unknown>>
  permission: Permission
  saving: boolean
  onSave(ops: MutateOps): void
}

function canWrite(p: Permission): boolean {
  return p === 'read-write' || p === 'data-admin' || p === 'admin'
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

export function TableBrowser({ table, schema, rows, permission, saving, onSave }: TableBrowserProps) {
  const [editMode, setEditMode] = useState(false)
  const edit = useDataEdit()
  const pk = schema.primaryKey ?? []
  const hasPk = pk.length > 0
  const editable = hasPk && canWrite(permission)
  const cols = schema.columns.map((c) => c.name)
  const byKey = Object.fromEntries(rows.map((r) => [rowKeyOf(r, pk), r]))
  const count = pendingCount(edit.edits)

  const exitEdit = () => { edit.reset(); setEditMode(false) }
  const save = () => onSave(buildMutateOps(edit.edits, byKey, pk))

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-slate-900 text-xs">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-2 bg-slate-50 dark:bg-slate-900/60">
        <span className="font-semibold text-slate-700 dark:text-slate-300">{table}</span>
        {editMode ? (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400">{count} 筆待儲存</span>
            <button type="button" onClick={() => edit.addInsert()} className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1">新增列</button>
            <button type="button" onClick={exitEdit} className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1">取消</button>
            <button type="button" onClick={save} disabled={saving || count === 0} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">儲存{saving ? '中…' : ''}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditMode(true)} disabled={!editable} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">編輯</button>
        )}
      </div>

      {!hasPk ? (
        <div className="px-3 py-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900">
          此表無主鍵,無法安全編輯。
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-left font-mono">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
            <tr>
              {cols.map((c) => (
                <th key={c} className="border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-300 font-semibold">{c}</th>
              ))}
              {editMode ? <th className="border-b border-slate-200 dark:border-slate-700 px-2 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const key = rowKeyOf(row, pk)
              const deleted = edit.edits.deletes.includes(key)
              const changed = !!edit.edits.updates[key]
              return (
                <tr key={key} className={`${deleted ? 'line-through opacity-50 bg-red-50 dark:bg-red-950/20' : changed ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                  {cols.map((c) => {
                    const current = c in (edit.edits.updates[key] ?? {}) ? edit.edits.updates[key][c] : row[c]
                    return (
                      <td key={c} className="px-3 py-1 border-b border-slate-100 dark:border-slate-800/40 text-slate-800 dark:text-slate-300">
                        {editMode && !deleted ? (
                          <input
                            aria-label={`編輯 ${c} 第 ${i + 1} 列`}
                            value={renderValue(current)}
                            onChange={(e) => edit.setCell(key, c, e.target.value)}
                            className="w-full bg-transparent outline-none focus:bg-white dark:focus:bg-slate-800 rounded px-1"
                          />
                        ) : (
                          renderValue(row[c])
                        )}
                      </td>
                    )
                  })}
                  {editMode ? (
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <button type="button" aria-label={`刪除第 ${i + 1} 列`} onClick={() => edit.toggleDelete(key)} className="text-red-500 hover:text-red-600">🗑</button>
                    </td>
                  ) : null}
                </tr>
              )
            })}
            {editMode
              ? edit.edits.inserts.map((draft, idx) => (
                  <tr key={`draft-${idx}`} className="bg-green-50 dark:bg-green-950/20">
                    {cols.map((c) => (
                      <td key={c} className="px-3 py-1 border-b border-slate-100 dark:border-slate-800/40">
                        <input
                          aria-label={`新增 ${c} 草稿 ${idx + 1}`}
                          value={renderValue(draft[c])}
                          onChange={(e) => edit.setInsertCell(idx, c, e.target.value)}
                          className="w-full bg-transparent outline-none focus:bg-white dark:focus:bg-slate-800 rounded px-1"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <button type="button" aria-label={`移除草稿 ${idx + 1}`} onClick={() => edit.removeInsert(idx)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/TableBrowser.test.tsx`
Expected: PASS(5 個 test 全綠)。

- [ ] **Step 5: 型別檢查 + Commit**

Run: `bunx tsc --noEmit`
Expected: 無錯誤。

```bash
git add src/views/TableBrowser.tsx tests/frontend/TableBrowser.test.tsx
git commit -m "feat: [frontend] TableBrowser — 表瀏覽 + 編輯模式 + 改動標記 + 儲存"
```

---

### Task C5: 串接 App 與側欄入口

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/hooks/useApp.ts`(或現有負責 open/permission 的 hook)

> 此任務把 `TableBrowser` 接進現有分頁/側欄。確切接點依現況微調;以下為必達行為與驗證。

- [ ] **Step 1: 保存 open 回傳的 permission**

在開啟連線之處(呼叫 `client.openConnection(id)`)把回傳的 `permission` 存入 app 狀態(例如 `useApp` 的 state 加 `permission: Permission`)。預設 `'query-only'`。

- [ ] **Step 2: 側欄點表 → 開表瀏覽**

在側欄表格點擊處(現有 `onLoadColumns` / `onInsertSelect` 旁),新增「瀏覽資料」動作:抓 `client.schemaTable(id, table)` 取 schema、`client.query(id, 'SELECT * FROM <table> LIMIT 200')` 取 rows,開一個 `TableBrowser` 分頁(tab 狀態加 `browse?: { table, schema, rows }`)。

> 表名需以 schema 的識別字慣例引用;此處沿用既有 `onInsertSelect` 產生 SELECT 的同套表名處理(目前為純表名);如既有未引號,維持一致,LIMIT 與 query 路由的 autoLimit 相容。

- [ ] **Step 3: 渲染 TableBrowser 並接 onSave**

當 active tab 為 browse 型,渲染:

```tsx
<TableBrowser
  table={active.browse.table}
  schema={active.browse.schema}
  rows={active.browse.rows}
  permission={app.permission}
  saving={app.saving}
  onSave={async (ops) => {
    await app.saveTableEdits(active.browse.table, ops) // 呼叫 client.mutate,成功後重抓 rows、清暫存、refetch
  }}
/>
```

`saveTableEdits` 行為:`client.mutate(id, table, ops)` → 成功則重抓 `SELECT * FROM table LIMIT 200` 更新 rows;失敗走既有 error channel(`ApiError` → ErrorBanner)。

- [ ] **Step 4: 手動驗證 + 型別檢查**

Run: `bunx tsc --noEmit`
Expected: 無錯誤。

Run: `bun run dev`(或既有啟動指令),手動確認:點表 → 出現表瀏覽 → 「編輯」進入可改 → 改一格顯示黃標 → 儲存後重抓。

- [ ] **Step 5: 跑全前端測試**

Run: `bun test tests/frontend/`
Expected: ALL PASS。

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/hooks/useApp.ts src/views/Sidebar.tsx
git commit -m "feat: [frontend] 側欄表瀏覽入口 + TableBrowser 串接 + 儲存編排"
```

---

## 階段 D — E2E、階段二、文件

### Task D1: E2E 旅程

**Files:**
- Create: `tests/e2e/journeys/data-edit.e2e.ts`

- [ ] **Step 1: 寫 E2E 旅程**

建立 `tests/e2e/journeys/data-edit.e2e.ts`(沿用既有 fixture sidecar 與 `APP_PATH`;測試表須為可寫且有主鍵):

```ts
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('browse → edit cell → save → re-read reflects change', async ({ page }) => {
  await page.goto(APP_PATH)

  // 由側欄點一張表進入表瀏覽(表名依 fixture;此處以 'users' 為例)
  await page.getByRole('button', { name: 'users', exact: true }).click()

  // 進入編輯模式
  await page.getByRole('button', { name: '編輯' }).click()

  // 改第一列某欄
  const cell = page.getByLabel('編輯 name 第 1 列')
  await cell.fill('edited-by-e2e')

  // 待儲存計數出現、儲存
  await expect(page.getByText(/待儲存/)).toBeVisible()
  await page.getByRole('button', { name: /儲存/ }).click()

  // 儲存後重抓,值已落地(回唯讀顯示)
  await expect(page.getByText('edited-by-e2e')).toBeVisible()
})
```

- [ ] **Step 2: 跑 E2E**

Run: `bun run test:e2e`(或既有 E2E 指令,如 `bunx playwright test tests/e2e/journeys/data-edit.e2e.ts`)
Expected: PASS。若 fixture 無可寫測試表,先在 e2e fixture 設定中補一張有主鍵的測試表。

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/journeys/data-edit.e2e.ts
git commit -m "test: [e2e] 資料編輯旅程 (瀏覽→編輯→儲存→重抓)"
```

---

### Task D2: 文件 — README v2 資料編輯段落

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 加段落**

在 README v2 功能說明處,新增「資料編輯」段落,說明:表瀏覽入口、顯式編輯模式、暫存+手動儲存、權限需求(INSERT/UPDATE 需 read-write、DELETE 需 data-admin)、blacklist 與無主鍵表的限制、目前僅 SQL 三系統。

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: [v2] README 資料編輯子系統段落"
```

---

### Task D3(階段二,後續):任意 SQL 單表偵測開放編輯

> **本任務為階段二跟進,非 MVP 必要。** 階段一所有任意 SQL 結果維持唯讀。

- [ ] **Step 1: 設計單表偵測**

新增純函式 `detectSingleTable(sql): string | null`(只認 `SELECT ... FROM <single table>`,排除 JOIN/子查詢/別名計算欄)。偵測成功且該表有主鍵且 PK 欄在結果欄位中 → 將該結果以 `TableBrowser` 可編輯模式呈現,複用 C 階段全部機制。

- [ ] **Step 2: TDD + 測試 + Commit**(沿用 C3 的純函式 TDD 模式:先寫 `detectSingleTable` 測試,再實作,再接 UI)。

---

## Self-Review

- **Spec 覆蓋**:
  - 「資料來源模型(兩者都要)」→ 階段一 TableBrowser(C),階段二單表偵測(D3,標明後續)。✅
  - 「提交模型(暗放+手動儲存)」→ `useDataEdit` + TableBrowser 儲存/取消(C3/C4)。✅
  - 「SQL 生成下沉 core」→ 重用 `DataExecutor`(core 計畫),sidecar 不組 SQL(B3)。✅
  - 「編輯防呆(顯式編輯模式)」→ TableBrowser editMode 預設關、權限 disable(C4)。✅
  - 「sidecar /data/mutate + 權限/blacklist/交易/並發」→ B3。✅
  - 「open/list 補 permission」→ open 補 permission(B5);list 端非編輯閘所需,故未納入(編輯模式以 open 連線的 permission 為準),屬有意縮減。
  - 「邊界:無主鍵 disable / 改 PK / 並發衝突 / blacklist 欄」→ C4 banner、B3 CONFLICT/BLACKLISTED。✅
  - 「測試策略(core/sidecar/前端/E2E)」→ B2/B3/B5、C2/C3/C4、D1。✅
- **Placeholder 掃描**:無 TBD;每個寫程式的步驟皆附完整程式碼與指令/預期。C5 為既有檔串接,以「必達行為 + 確切接點依現況微調」描述並附驗證指令(因接點依 App/hook 現況,不臆造未存在的內部結構)。
- **型別一致**:`MutateOps`/`MutateResult`/`Permission`(types.ts, C1)貫穿 client(C2)、data-edit(C3)、TableBrowser(C4);sidecar `MutateBody`(B2)欄位與前端 `MutateOps` 對齊(updates{pk,set}/inserts{values}/deletes{pk})。`DataExecutor` 方法簽章與 B3 呼叫一致(executeUpdate(table,set,pk,schema,opts)/executeDelete(table,pk,schema,opts)/executeInsert(table,values,schema,opts))。
- **偏離 spec 之處**:(1) core 改為重用 `DataExecutor` 而非新建 builder(已與使用者確認,更 DRY);(2) DELETE 權限門檻為 `data-admin`(spec 僅說 read-write+)—— 因 `DataExecutor` 內建此規則,計畫據實反映並在 README/權限門說明;(3) permission 僅加在 open 回應(足以驅動編輯模式閘),list 未加。
