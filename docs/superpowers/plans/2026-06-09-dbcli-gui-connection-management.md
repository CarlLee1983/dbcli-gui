# dbcli-gui 連線管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **執行所在 repo:** `/Users/carl/Dev/CMG/dbcli-gui`。**前置相依:計畫 1(`@carllee1983/dbcli@1.30.0`)已發版**——Task 1 第一步即 bump 依賴。

**Goal:** 在 dbcli-gui 加「連線管理」——sidecar 6 路由(create/update/delete/test/set-default/get)接 dbcli core 1.30.0 的 writer,前端置中 Modal 表單 + Sidebar 入口 + `useConnections` CRUD,並補一條 E2E 旅程。

**Architecture:** sidecar 新 `routes/connections-admin.ts` 用 core 純函式 read-modify-write(原子寫)+ `writeConnectionSecret`;test 路由用 `AdapterFactory` 臨時 adapter ping(注入 seam 供測試)。前端 `ConnectionFormModal` 沿用 `CellDetailModal` 的 glassmorphism 模式;`useConnections` 擴充 CRUD + test;`api/client` 加對應呼叫。SQL 三系統(mysql/postgresql/mariadb)、密碼留白=不變。

**Tech Stack:** Bun(`bun test`、`Bun.serve`)、React 19 + happy-dom + `@testing-library/react`、Playwright、zod v3、`@carllee1983/dbcli/core@1.30.0`。

---

## 既成事實(已驗證)

- **core 1.30.0 新匯出**(計畫 1):`writeV2Config(projectPath, config)`、`readV2Config(projectPath)`、`detectConfigVersion(raw)`、`upsertConnection(config, input)`、`removeConnection(config, name)`、`setDefaultConnection(config, name)`、`migrateV1ToV2(v1)`、`writeConnectionSecret(projectPath, name, 'password', value)`、`envVarNameFor`、`readConfig(path, name?)`、`AdapterFactory.createSqlAdapter(opts)`、`resolveConfigStoragePath`、型別 `ConnectionInput`/`SqlSystem`/`DbcliConfigV2`/`DbcliConfig`。
- **錯誤封裝**(`shared/errors.ts`):`toErrorBody(err)` + `statusForCode(code)`;現有碼 `BAD_REQUEST/PERMISSION/BLACKLISTED/NOT_OPEN/NOT_CONFIGURED/CONNECTION/INTERNAL`。**需新增 `CONFLICT`(409)、`NOT_FOUND`(404)**。
- **route 模式**(`sidecar/server.ts`):`post(h)` = `{ POST: withCors(guard(token, h)), OPTIONS: corsPreflight }`;handler 是 `(req) => Response`;body 用 zod `safeParse`;回 `json(body, status)`(來自 `sidecar/http.ts`)。
- **ServerDeps** 目前 `{ pool, token, port, listConnections? }`;`index.ts` 以 `cfg.dbcliPath` 建 pool/lister。**需把 `dbcliPath` 傳進 `createServer` 給 admin handlers。**
- **adapter**:`AdapterFactory.createSqlAdapter(opts: SqlConnectionOptions)` → `DatabaseAdapter`(`connect()`/`testConnection()`/`disconnect()`)。
- **前端 client**(`src/api/client.ts`):`DbClient` 介面 + `makeClient(base, token)`;`post(path, body)` 自動帶 bearer、非 2xx 丟 `ApiError(code,message,status)`。
- **前端型別**(`src/api/types.ts`):`ConnectionSummary { name; system; isDefault }`。
- **hook**(`src/hooks/useConnections.ts`):`useConnections(client)` 回 `ConnectionsApi`,有 `refreshConnections()`、`setError`、`client`。
- **modal 模式**(`src/components/CellDetailModal.tsx`):`role="dialog" aria-modal` + `bg-slate-900/60 backdrop-blur-sm` 遮罩 + Esc 關閉 + `onClick` 遮罩關、內層 `stopPropagation`。
- **Sidebar 入口**(`src/views/Sidebar.tsx`):「連線列表」section(`<Database/> 連線列表`)逐條 `c.name`,`c.isDefault` 顯示「預設」badge。
- **測試慣例**:sidecar 測 `tests/sidecar/*.test.ts`(`bun test`,真 `createServer`,`port:0`,temp `.dbcli`);前端測 `tests/frontend/*.test.tsx`(happy-dom + `@testing-library/react`);E2E `tests/e2e/journeys/*.e2e.ts`(Playwright,對 `serve-fixture.ts`)。

---

## File Structure

**sidecar**
- `shared/errors.ts` — **修改**。`STATUS_BY_CODE` 加 `CONFLICT:409`、`NOT_FOUND:404`。
- `shared/schemas.ts` — **修改**。加 `ConnectionInputBody`、`ConnectionNameBody`、`TestConnectionBody`。
- `sidecar/routes/connections-admin.ts` — **建立**。`makeConnectionAdminHandlers(dbcliPath, deps?)` → `{ create, update, remove, setDefault, test, get }`。
- `sidecar/server.ts` — **修改**。`ServerDeps` 加 `dbcliPath`;wire 6 新路由。
- `sidecar/index.ts` — **修改**。傳 `dbcliPath: cfg.dbcliPath`。

**前端**
- `src/api/types.ts` — **修改**。加 `ConnectionDetail`、`ConnectionFormInput`、`TestResult`。
- `src/api/client.ts` — **修改**。`DbClient` 加 `createConnection/updateConnection/deleteConnection/setDefaultConnection/testConnection/getConnection`。
- `src/hooks/useConnections.ts` — **修改**。加 `createConnection/updateConnection/deleteConnection/setDefault/testConnection`(成功後 `refreshConnections`)。
- `src/components/ConnectionFormModal.tsx` — **建立**。置中 modal 表單 + 測試連線。
- `src/views/Sidebar.tsx` — **修改**。標題列 `+`、每列 hover ✎/🗑;新增 props。
- `src/App.tsx` — **修改**。掛 `ConnectionFormModal` 狀態 + 接 hook。

**E2E**
- `tests/e2e/serve-fixture.ts` — **修改**。建 temp `.dbcli` + binding + 初始 v2 config,傳 `dbcliPath`;注入假 `createAdapter`(test 永遠成功)。
- `tests/e2e/journeys/connections.e2e.ts` — **建立**。
- `README.md` — **修改**。v2 連線管理段落。

**任務順序理由:** 先 Phase B sidecar(可獨立 `bun test`),再 Phase C 前端(接已綠的路由),最後 Phase D E2E 串接 + 文件。Phase B 內:Task 1 錯誤碼/schema(零相依)→ Task 2 CRUD handlers → Task 3 test handler → Task 4 wire server。

---

# Phase B — sidecar 路由

## Task 1: 錯誤碼 + body schema

**Files:**
- Modify: `shared/errors.ts`
- Modify: `shared/schemas.ts`
- Test: `tests/sidecar/connections-admin-schema.test.ts`(建立)

- [ ] **Step 1: bump 依賴 + 寫失敗測試**

Run: `bun add @carllee1983/dbcli@^1.30.0`

`tests/sidecar/connections-admin-schema.test.ts`:

```typescript
import { test, expect } from 'bun:test'
import { ConnectionInputBody, ConnectionNameBody, TestConnectionBody } from '../../shared/schemas'
import { statusForCode } from '../../shared/errors'

test('CONFLICT / NOT_FOUND map to 409 / 404', () => {
  expect(statusForCode('CONFLICT')).toBe(409)
  expect(statusForCode('NOT_FOUND')).toBe(404)
})

test('ConnectionInputBody accepts a full SQL connection, password optional', () => {
  const ok = ConnectionInputBody.safeParse({
    name: 'staging', system: 'postgresql', host: 'h', port: 5432, user: 'u', database: 'd', password: 'p',
  })
  expect(ok.success).toBe(true)
  const noPw = ConnectionInputBody.safeParse({
    name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd',
  })
  expect(noPw.success).toBe(true)
})

test('ConnectionInputBody rejects non-SQL system and bad port', () => {
  expect(ConnectionInputBody.safeParse({ name: 'x', system: 'redis', host: 'h', port: 1, user: 'u', database: 'd' }).success).toBe(false)
  expect(ConnectionInputBody.safeParse({ name: 'x', system: 'mysql', host: 'h', port: 0, user: 'u', database: 'd' }).success).toBe(false)
})

test('ConnectionNameBody / TestConnectionBody', () => {
  expect(ConnectionNameBody.safeParse({ name: 'a' }).success).toBe(true)
  expect(TestConnectionBody.safeParse({ system: 'mariadb', host: 'h', port: 3306, user: 'u', database: 'd', password: 'p' }).success).toBe(true)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/connections-admin-schema.test.ts`
Expected: FAIL — schema 未匯出、`statusForCode('CONFLICT')` 回 500。

- [ ] **Step 3: 寫實作**

`shared/errors.ts` 的 `STATUS_BY_CODE` 加兩行:

```typescript
const STATUS_BY_CODE: Record<string, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  PERMISSION: 403,
  BLACKLISTED: 403,
  NOT_OPEN: 409,
  CONFLICT: 409,
  NOT_CONFIGURED: 501,
  CONNECTION: 502,
  INTERNAL: 500,
}
```

`shared/schemas.ts` 末端加:

```typescript
const SqlSystemEnum = z.enum(['mysql', 'postgresql', 'mariadb'])

export const ConnectionInputBody = z.object({
  name: z.string().min(1),
  system: SqlSystemEnum,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1),
  database: z.string().min(1),
  password: z.string().optional(), // 留白/未給 = 不變(更新);建立時可給空字串
})
export const ConnectionNameBody = z.object({ name: z.string().min(1) })
export const TestConnectionBody = z.object({
  system: SqlSystemEnum,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1),
  database: z.string().min(1),
  password: z.string().optional(),
})

export type ConnectionInputBody = z.infer<typeof ConnectionInputBody>
export type ConnectionNameBody = z.infer<typeof ConnectionNameBody>
export type TestConnectionBody = z.infer<typeof TestConnectionBody>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/connections-admin-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/errors.ts shared/schemas.ts tests/sidecar/connections-admin-schema.test.ts package.json bun.lock
git commit -m "feat: [sidecar] connection-admin error codes + body schemas; bump dbcli 1.30.0"
```

---

## Task 2: CRUD handlers(create/update/delete/set-default/get)

**Files:**
- Create: `sidecar/routes/connections-admin.ts`
- Test: `tests/sidecar/connections-admin.test.ts`

- [ ] **Step 1: 寫失敗測試**

`tests/sidecar/connections-admin.test.ts`:

```typescript
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import { writeV2Config, readV2Config, resolveConnection, loadConnectionEnv } from '@carllee1983/dbcli/core'
import { writeProjectBinding, getProjectStoragePath } from '@carllee1983/dbcli/core'
import { makeConnectionAdminHandlers } from '../../sidecar/routes/connections-admin'

const TMP = '/tmp/dbcli-gui-admin-test'
const PROJECT = join(TMP, '.dbcli')

function initialConfig() {
  return {
    version: 2, default: 'primary',
    connections: {
      primary: { system: 'mysql', host: 'localhost', port: 3306, user: 'root',
        password: { $env: 'DBCLI_PRIMARY_PASSWORD' }, database: 'app', permission: 'query-only', envFile: '.env.primary' },
    },
    schema: {}, schemas: {}, metadata: { version: '2.0' },
    blacklist: { tables: [], columns: {} },
    audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
  }
}

function req(body: unknown): Request {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
}

let handlers: ReturnType<typeof makeConnectionAdminHandlers>

beforeEach(async () => {
  await Bun.$`rm -rf ${TMP}`
  await Bun.$`mkdir -p ${PROJECT}`
  await writeProjectBinding(PROJECT, getProjectStoragePath(PROJECT))
  await writeV2Config(PROJECT, initialConfig() as never)
  handlers = makeConnectionAdminHandlers(PROJECT)
})
afterEach(async () => {
  await Bun.$`rm -rf ${TMP}`
  delete process.env.DBCLI_STAGING_PASSWORD
})

test('create adds a connection + writes its secret, retrievable via reader', async () => {
  const res = await handlers.create(req({
    name: 'staging', system: 'postgresql', host: 'db.stg', port: 5432, user: 'app', database: 'app', password: 'sekret',
  }))
  expect(res.status).toBe(200)

  const cfg = await readV2Config(PROJECT)
  expect(Object.keys(cfg.connections).sort()).toEqual(['primary', 'staging'])
  const resolved = resolveConnection(cfg, 'staging')
  await loadConnectionEnv(resolved, getProjectStoragePath(PROJECT))
  expect(process.env.DBCLI_STAGING_PASSWORD).toBe('sekret')
})

test('create on a duplicate name → 409 CONFLICT', async () => {
  const res = await handlers.create(req({ name: 'primary', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect(res.status).toBe(409)
  expect((await res.json()).error.code).toBe('CONFLICT')
})

test('update with blank password keeps the existing secret', async () => {
  await handlers.create(req({ name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd', password: 'orig' }))
  const res = await handlers.update(req({ name: 'staging', system: 'mysql', host: 'h2', port: 3307, user: 'u', database: 'd' }))
  expect(res.status).toBe(200)
  const env = await Bun.file(join(getProjectStoragePath(PROJECT), '.env.staging')).text()
  expect(env).toContain('DBCLI_STAGING_PASSWORD=orig')
  expect((await readV2Config(PROJECT)).connections.staging.host).toBe('h2')
})

test('update unknown → 404 NOT_FOUND', async () => {
  const res = await handlers.update(req({ name: 'ghost', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect(res.status).toBe(404)
})

test('delete removes; deleting the only connection → 409', async () => {
  await handlers.create(req({ name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect((await handlers.remove(req({ name: 'staging' }))).status).toBe(200)
  const res = await handlers.remove(req({ name: 'primary' })) // last one
  expect(res.status).toBe(409)
})

test('set-default switches the default', async () => {
  await handlers.create(req({ name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect((await handlers.setDefault(req({ name: 'staging' }))).status).toBe(200)
  expect((await readV2Config(PROJECT)).default).toBe('staging')
})

test('get returns fields without the password', async () => {
  const res = await handlers.get(new Request('http://x/connections/get?name=primary'))
  const body = await res.json()
  expect(body).toMatchObject({ name: 'primary', system: 'mysql', host: 'localhost', port: 3306, user: 'root', database: 'app' })
  expect(body.password).toBeUndefined()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/connections-admin.test.ts`
Expected: FAIL — `Cannot find module '../../sidecar/routes/connections-admin'`

> 註:本測試用的 `writeProjectBinding`/`getProjectStoragePath` 由 core 1.30.0 匯出(計畫 1 Task 6 已涵蓋)。若所用 1.30.0 版未含這兩個匯出,回計畫 1 Task 6 補上後重發版。

- [ ] **Step 3: 寫實作**

`sidecar/routes/connections-admin.ts`:

```typescript
import {
  readV2Config, writeV2Config, detectConfigVersion, migrateV1ToV2, readConfig,
  upsertConnection, removeConnection, setDefaultConnection, writeConnectionSecret,
  resolveConfigStoragePath, type ConnectionInput,
} from '@carllee1983/dbcli/core'
import { join } from 'node:path'
import { ConnectionInputBody, ConnectionNameBody } from '../../shared/schemas'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { json } from '../http'

/** Read the current v2 config, migrating a v1 project on first write. */
async function loadV2(dbcliPath: string) {
  const storagePath = await resolveConfigStoragePath(dbcliPath)
  const raw = await Bun.file(join(storagePath, 'config.json')).json().catch(() => undefined)
  if (raw !== undefined && detectConfigVersion(raw) === 2) return readV2Config(dbcliPath)
  // v1 (or missing) → migrate from the resolved v1 config
  const v1 = await readConfig(dbcliPath)
  return migrateV1ToV2(v1)
}

export function makeConnectionAdminHandlers(dbcliPath: string) {
  const ok = (body: unknown = { ok: true }) => json(body)
  const fail = (err: unknown) => {
    const body = toErrorBody(err)
    return json(body, statusForCode(body.error.code))
  }
  const bad = () => json({ error: { code: 'BAD_REQUEST', message: 'invalid body' } }, 400)
  const conflict = (m: string) => json({ error: { code: 'CONFLICT', message: m } }, 409)
  const notFound = (m: string) => json({ error: { code: 'NOT_FOUND', message: m } }, 404)

  async function writeWithSecret(name: string, input: ConnectionInput, password: string | undefined) {
    const cfg = await loadV2(dbcliPath)
    const next = upsertConnection(cfg, input)
    await writeV2Config(dbcliPath, next)
    if (password !== undefined && password !== '') {
      await writeConnectionSecret(dbcliPath, name, 'password', password)
    }
  }

  return {
    async create(req: Request): Promise<Response> {
      const p = ConnectionInputBody.safeParse(await req.json().catch(() => null))
      if (!p.success) return bad()
      try {
        const cfg = await loadV2(dbcliPath)
        if (p.data.name in cfg.connections) return conflict(`連線 '${p.data.name}' 已存在`)
        const { password, ...input } = p.data
        await writeWithSecret(p.data.name, input, password)
        return ok()
      } catch (err) { return fail(err) }
    },

    async update(req: Request): Promise<Response> {
      const p = ConnectionInputBody.safeParse(await req.json().catch(() => null))
      if (!p.success) return bad()
      try {
        const cfg = await loadV2(dbcliPath)
        if (!(p.data.name in cfg.connections)) return notFound(`連線 '${p.data.name}' 不存在`)
        const { password, ...input } = p.data
        await writeWithSecret(p.data.name, input, password) // blank password → secret untouched
        return ok()
      } catch (err) { return fail(err) }
    },

    async remove(req: Request): Promise<Response> {
      const p = ConnectionNameBody.safeParse(await req.json().catch(() => null))
      if (!p.success) return bad()
      try {
        const cfg = await loadV2(dbcliPath)
        if (!(p.data.name in cfg.connections)) return notFound(`連線 '${p.data.name}' 不存在`)
        try {
          await writeV2Config(dbcliPath, removeConnection(cfg, p.data.name))
        } catch (e) {
          if (e instanceof Error && e.message.includes('最後一條')) return conflict(e.message)
          throw e
        }
        return ok()
      } catch (err) { return fail(err) }
    },

    async setDefault(req: Request): Promise<Response> {
      const p = ConnectionNameBody.safeParse(await req.json().catch(() => null))
      if (!p.success) return bad()
      try {
        const cfg = await loadV2(dbcliPath)
        if (!(p.data.name in cfg.connections)) return notFound(`連線 '${p.data.name}' 不存在`)
        await writeV2Config(dbcliPath, setDefaultConnection(cfg, p.data.name))
        return ok()
      } catch (err) { return fail(err) }
    },

    async get(req: Request): Promise<Response> {
      const name = new URL(req.url).searchParams.get('name') ?? ''
      try {
        const cfg = await loadV2(dbcliPath)
        const c = cfg.connections[name] as Record<string, unknown> | undefined
        if (!c) return notFound(`連線 '${name}' 不存在`)
        return json({ name, system: c.system, host: c.host, port: c.port, user: c.user, database: c.database })
      } catch (err) { return fail(err) }
    },

    test: undefined as never, // Task 3
  }
}
```

> **原子寫**:由計畫 1 Task 7 將 `writeV2Config` 改為 temp+rename,本處呼叫即自動受惠(spec 風險 #1)。若所用 core 版本未含此修正,改在此模組以 `atomicWriteV2(dbcliPath, cfg)` wrapper 包覆:寫 `config.json.tmp` 再 `rename`。

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/connections-admin.test.ts`
Expected: PASS(7 案例)

- [ ] **Step 5: Commit**

```bash
git add sidecar/routes/connections-admin.ts tests/sidecar/connections-admin.test.ts
git commit -m "feat: [sidecar] connection CRUD handlers (create/update/delete/set-default/get)"
```

---

## Task 3: test-connection handler(臨時 adapter ping,注入 seam)

**Files:**
- Modify: `sidecar/routes/connections-admin.ts`
- Test: `tests/sidecar/connections-admin.test.ts`(加 describe)

- [ ] **Step 1: 寫失敗測試**

在 `connections-admin.test.ts` 加(頂部 import 補 `makeConnectionAdminHandlers` 已在;另引型別):

```typescript
import type { DatabaseAdapter } from '@carllee1983/dbcli/core'

function fakeAdapter(result: { connect?: () => Promise<void>; ping?: boolean }): DatabaseAdapter {
  return {
    connect: result.connect ?? (async () => {}),
    disconnect: async () => {},
    testConnection: async () => result.ping ?? true,
    execute: async () => ({}) as never,
    listTables: async () => [],
    getTableSchema: async () => ({}) as never,
    getServerVersion: async () => '0',
  } as unknown as DatabaseAdapter
}

test('test handler returns ok on a successful ping', async () => {
  const h = makeConnectionAdminHandlers(PROJECT, { createAdapter: () => fakeAdapter({ ping: true }) })
  const res = await h.test(req({ system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd', password: 'p' }))
  expect(res.status).toBe(200)
  expect((await res.json()).ok).toBe(true)
})

test('test handler maps a connect failure to CONNECTION 502', async () => {
  const h = makeConnectionAdminHandlers(PROJECT, {
    createAdapter: () => fakeAdapter({ connect: async () => { const e = new Error('refused'); e.name = 'ConnectionError'; throw e } }),
  })
  const res = await h.test(req({ system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect(res.status).toBe(502)
  expect((await res.json()).error.code).toBe('CONNECTION')
})
```

> 註:`ConnectionError` 由 core 匯出,但測試用「name=ConnectionError 的 Error」即可被 `toErrorBody` 的 name 分支... 實際 `toErrorBody` 以 `instanceof ConnectionError` 判斷。為讓 fake 走 CONNECTION,改用真 `ConnectionError`:`import { ConnectionError } from '@carllee1983/dbcli/core'` 後 `throw new ConnectionError('refused')`。請在測試以真 `ConnectionError` 取代上面的手造 Error。

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/connections-admin.test.ts -t "test handler"`
Expected: FAIL — `h.test is not a function` / deps 參數不存在。

- [ ] **Step 3: 寫實作**

改 `makeConnectionAdminHandlers` 簽章與 test 實作:

```typescript
import { AdapterFactory, type DatabaseAdapter, type SqlConnectionOptions } from '@carllee1983/dbcli/core'
import { TestConnectionBody } from '../../shared/schemas'

export interface AdminDeps {
  createAdapter?: (opts: SqlConnectionOptions) => DatabaseAdapter
}

export function makeConnectionAdminHandlers(dbcliPath: string, deps: AdminDeps = {}) {
  const createAdapter = deps.createAdapter ?? ((opts) => AdapterFactory.createSqlAdapter(opts))
  // ...(其餘 ok/fail/bad/conflict/notFound/writeWithSecret/CRUD 不變)...

  return {
    // ...create / update / remove / setDefault / get 同 Task 2...
    async test(req: Request): Promise<Response> {
      const p = TestConnectionBody.safeParse(await req.json().catch(() => null))
      if (!p.success) return bad()
      const adapter = createAdapter(p.data as SqlConnectionOptions)
      const started = Date.now()
      try {
        await adapter.connect()
        const ok = await adapter.testConnection()
        if (!ok) return json({ error: { code: 'CONNECTION', message: 'ping 失敗' } }, 502)
        return json({ ok: true, ms: Date.now() - started })
      } catch (err) {
        return fail(err)
      } finally {
        try { await adapter.disconnect() } catch { /* 已斷或從未連上 */ }
      }
    },
  }
}
```

把 Task 2 留的 `test: undefined as never` 移除,改為上面的 `test` 實作。

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/connections-admin.test.ts`
Expected: PASS(9 案例全綠)

- [ ] **Step 5: Commit**

```bash
git add sidecar/routes/connections-admin.ts tests/sidecar/connections-admin.test.ts
git commit -m "feat: [sidecar] test-connection handler with injectable adapter seam"
```

---

## Task 4: wire 進 server + index

**Files:**
- Modify: `sidecar/server.ts`
- Modify: `sidecar/index.ts`
- Test: `tests/sidecar/connections-admin-route.test.ts`(建立,end-to-end 過 HTTP)

- [ ] **Step 1: 寫失敗測試**

`tests/sidecar/connections-admin-route.test.ts`:

```typescript
import { test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import { writeV2Config, writeProjectBinding, getProjectStoragePath, readV2Config } from '@carllee1983/dbcli/core'
import { ConnectionPool } from '../../sidecar/connection-pool'
import { createServer } from '../../sidecar/server'

const TMP = '/tmp/dbcli-gui-admin-route-test'
const PROJECT = join(TMP, '.dbcli')
const TOKEN = 'tok'

function initialConfig() {
  return {
    version: 2, default: 'primary',
    connections: { primary: { system: 'mysql', host: 'localhost', port: 3306, user: 'root',
      password: { $env: 'DBCLI_PRIMARY_PASSWORD' }, database: 'app', permission: 'query-only', envFile: '.env.primary' } },
    schema: {}, schemas: {}, metadata: { version: '2.0' },
    blacklist: { tables: [], columns: {} },
    audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
  }
}

let server: ReturnType<typeof createServer>
beforeEach(async () => {
  await Bun.$`rm -rf ${TMP}`; await Bun.$`mkdir -p ${PROJECT}`
  await writeProjectBinding(PROJECT, getProjectStoragePath(PROJECT))
  await writeV2Config(PROJECT, initialConfig() as never)
  const pool = new ConnectionPool({ loadConfig: async () => ({}) as never, openAdapter: () => ({}) as never })
  server = createServer({ pool, token: TOKEN, port: 0, dbcliPath: PROJECT })
})
afterEach(async () => { await server.stop(true); await Bun.$`rm -rf ${TMP}` })

test('POST /connections/create then list reflects it', async () => {
  const base = `http://127.0.0.1:${server.port}`
  const auth = { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }
  const res = await fetch(`${base}/connections/create`, { method: 'POST', headers: auth,
    body: JSON.stringify({ name: 'staging', system: 'postgresql', host: 'h', port: 5432, user: 'u', database: 'd', password: 'p' }) })
  expect(res.status).toBe(200)
  expect(Object.keys((await readV2Config(PROJECT)).connections).sort()).toEqual(['primary', 'staging'])
})

test('admin routes require auth', async () => {
  const res = await fetch(`http://127.0.0.1:${server.port}/connections/create`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  expect(res.status).toBe(401)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/connections-admin-route.test.ts`
Expected: FAIL — `createServer` 無 `dbcliPath`、路由不存在 → create 回 404。

- [ ] **Step 3: 寫實作**

`sidecar/server.ts`:① import `makeConnectionAdminHandlers`;② `ServerDeps` 加 `dbcliPath: string`;③ 在 `routes` 加 6 條。

```typescript
import { makeConnectionAdminHandlers } from './routes/connections-admin'
// ...
export interface ServerDeps {
  pool: ConnectionPool
  token: string
  port: number
  dbcliPath: string
  listConnections?: ConnectionLister
}
// 在 createServer 內,conn/schema 之後:
const admin = makeConnectionAdminHandlers(deps.dbcliPath)
// routes 物件加:
'/connections/create': post(admin.create),
'/connections/update': post(admin.update),
'/connections/delete': post(admin.remove),
'/connections/set-default': post(admin.setDefault),
'/connections/test': post(admin.test),
'/connections/get': { GET: withCors(guard(deps.token, admin.get)), OPTIONS: corsPreflight },
```

`sidecar/index.ts`:`createServer({ ..., dbcliPath: cfg.dbcliPath })`。

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/connections-admin-route.test.ts && bun test`
Expected: 兩測檔 + 全 sidecar 測綠。

- [ ] **Step 5: Commit**

```bash
git add sidecar/server.ts sidecar/index.ts tests/sidecar/connections-admin-route.test.ts
git commit -m "feat: [sidecar] wire connection-admin routes into server"
```

---

# Phase C — 前端

## Task 5: api client + 型別

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`
- Test: `tests/frontend/client.test.ts`(加案例)

- [ ] **Step 1: 寫失敗測試**

在 `tests/frontend/client.test.ts` 加(沿用該檔既有 mock-fetch 風格;若無,以下自帶):

```typescript
import { test, expect } from 'bun:test'
import { makeClient } from '../../src/api/client'

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => handler(String(url), init)) as typeof fetch
}

test('createConnection posts to /connections/create', async () => {
  let seen: { url: string; body: unknown } | null = null
  stubFetch((url, init) => { seen = { url, body: JSON.parse(String(init?.body)) }; return new Response(JSON.stringify({ ok: true })) })
  const c = makeClient('http://x', 't')
  await c.createConnection({ name: 'a', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd', password: 'p' })
  expect(seen!.url).toBe('http://x/connections/create')
  expect(seen!.body).toMatchObject({ name: 'a', system: 'mysql' })
})

test('testConnection returns { ok, ms }', async () => {
  stubFetch(() => new Response(JSON.stringify({ ok: true, ms: 12 })))
  const c = makeClient('http://x', 't')
  expect(await c.testConnection({ system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' })).toEqual({ ok: true, ms: 12 })
})

test('getConnection reads ?name=', async () => {
  let seenUrl = ''
  stubFetch((url) => { seenUrl = url; return new Response(JSON.stringify({ name: 'a', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' })) })
  const c = makeClient('http://x', 't')
  await c.getConnection('a')
  expect(seenUrl).toBe('http://x/connections/get?name=a')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/client.test.ts`
Expected: FAIL — `createConnection`/`testConnection`/`getConnection` 不存在。

- [ ] **Step 3: 寫實作**

`src/api/types.ts` 加:

```typescript
export type SqlSystem = 'mysql' | 'postgresql' | 'mariadb'

export interface ConnectionFormInput {
  name: string
  system: SqlSystem
  host: string
  port: number
  user: string
  database: string
  password?: string // 留白 = 不變(更新);建立時可給
}

export interface ConnectionDetail {
  name: string
  system: SqlSystem
  host: string
  port: number
  user: string
  database: string
}

export interface TestResult { ok: boolean; ms: number }
```

`src/api/client.ts`:① import 補型別;② `DbClient` 介面加方法;③ `makeClient` return 物件加實作。

```typescript
// DbClient 介面新增:
createConnection(input: ConnectionFormInput): Promise<{ ok: boolean }>
updateConnection(input: ConnectionFormInput): Promise<{ ok: boolean }>
deleteConnection(name: string): Promise<{ ok: boolean }>
setDefaultConnection(name: string): Promise<{ ok: boolean }>
testConnection(input: Omit<ConnectionFormInput, 'name'>): Promise<TestResult>
getConnection(name: string): Promise<ConnectionDetail>

// makeClient return 內新增:
createConnection: (input) => post('/connections/create', input) as Promise<{ ok: boolean }>,
updateConnection: (input) => post('/connections/update', input) as Promise<{ ok: boolean }>,
deleteConnection: (name) => post('/connections/delete', { name }) as Promise<{ ok: boolean }>,
setDefaultConnection: (name) => post('/connections/set-default', { name }) as Promise<{ ok: boolean }>,
testConnection: (input) => post('/connections/test', input) as Promise<TestResult>,
getConnection: (name) => get(`/connections/get?name=${encodeURIComponent(name)}`) as Promise<ConnectionDetail>,
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/api/client.ts tests/frontend/client.test.ts
git commit -m "feat: [frontend] api client connection CRUD + test methods"
```

---

## Task 6: useConnections 擴充 CRUD

**Files:**
- Modify: `src/hooks/useConnections.ts`
- Test: `tests/frontend/useConnections.test.ts`(加案例)

- [ ] **Step 1: 寫失敗測試**

```typescript
import { test, expect } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useConnections } from '../../src/hooks/useConnections'
import type { DbClient } from '../../src/api/client'

function stubClient(over: Partial<DbClient>): DbClient {
  return {
    health: async () => ({ ok: true, version: '0' }),
    listConnections: async () => ({ connections: [] }),
    openConnection: async () => ({ ok: true, system: 'mysql' }),
    closeConnection: async () => ({ ok: true }),
    query: async () => ({ rows: [], fields: [], rowCount: 0, ms: 0 }),
    schemaTree: async () => ({ tables: [] }),
    schemaTable: async () => ({ name: '', columns: [] }),
    exportRows: async () => {},
    createConnection: async () => ({ ok: true }),
    updateConnection: async () => ({ ok: true }),
    deleteConnection: async () => ({ ok: true }),
    setDefaultConnection: async () => ({ ok: true }),
    testConnection: async () => ({ ok: true, ms: 5 }),
    getConnection: async () => ({ name: 'a', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }),
    ...over,
  } as DbClient
}

test('createConnection calls client then refreshes the list', async () => {
  const calls: string[] = []
  let listResult = [{ name: 'primary', system: 'mysql', isDefault: true }]
  const client = stubClient({
    createConnection: async () => { calls.push('create'); listResult = [...listResult, { name: 'staging', system: 'mysql', isDefault: false }]; return { ok: true } },
    listConnections: async () => ({ connections: listResult }),
  })
  const { result } = renderHook(() => useConnections(client))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.createConnection({ name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd', password: 'p' }) })
  expect(calls).toEqual(['create'])
  await waitFor(() => expect(result.current.connections.map((c) => c.name)).toContain('staging'))
})

test('testConnection returns the result without touching the list', async () => {
  const client = stubClient({ testConnection: async () => ({ ok: true, ms: 9 }) })
  const { result } = renderHook(() => useConnections(client))
  await waitFor(() => expect(result.current.online).toBe(true))
  let r: { ok: boolean; ms: number } | undefined
  await act(async () => { r = await result.current.testConnection({ system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }) })
  expect(r).toEqual({ ok: true, ms: 9 })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/useConnections.test.ts`
Expected: FAIL — `createConnection`/`testConnection` 不在 `ConnectionsApi`。

- [ ] **Step 3: 寫實作**

`src/hooks/useConnections.ts`:`ConnectionsApi` 介面加方法,並在 hook body 以 `useCallback` 實作(成功後 `refreshConnections`;`testConnection` 不刷新、直接回傳)。

```typescript
// 介面新增:
import type { ConnectionFormInput, ConnectionDetail, TestResult } from '../api/types'
// ConnectionsApi 內:
createConnection(input: ConnectionFormInput): Promise<void>
updateConnection(input: ConnectionFormInput): Promise<void>
deleteConnection(name: string): Promise<void>
setDefault(name: string): Promise<void>
testConnection(input: Omit<ConnectionFormInput, 'name'>): Promise<TestResult>
getConnection(name: string): Promise<ConnectionDetail>

// hook body(refreshConnections 之後)新增:
const mutate = useCallback(async (fn: () => Promise<unknown>) => {
  setError(null)
  try { await fn(); await refreshConnections() }
  catch (err) { setError(toApiError(err)); throw toApiError(err) }
}, [refreshConnections])

const createConnection = useCallback((input: ConnectionFormInput) => mutate(() => clientRef.current.createConnection(input)).then(() => {}), [mutate])
const updateConnection = useCallback((input: ConnectionFormInput) => mutate(() => clientRef.current.updateConnection(input)).then(() => {}), [mutate])
const deleteConnection = useCallback((name: string) => mutate(() => clientRef.current.deleteConnection(name)).then(() => {}), [mutate])
const setDefault = useCallback((name: string) => mutate(() => clientRef.current.setDefaultConnection(name)).then(() => {}), [mutate])
const testConnection = useCallback((input: Omit<ConnectionFormInput, 'name'>) => clientRef.current.testConnection(input), [])
const getConnection = useCallback((name: string) => clientRef.current.getConnection(name), [])

// return 物件補上 createConnection/updateConnection/deleteConnection/setDefault/testConnection/getConnection
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/useConnections.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useConnections.ts tests/frontend/useConnections.test.ts
git commit -m "feat: [frontend] useConnections CRUD + test actions"
```

---

## Task 7: ConnectionFormModal

**Files:**
- Create: `src/components/ConnectionFormModal.tsx`
- Test: `tests/frontend/ConnectionFormModal.test.tsx`

- [ ] **Step 1: 寫失敗測試**

`tests/frontend/ConnectionFormModal.test.tsx`:

```typescript
import { test, expect, mock } from 'bun:test'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConnectionFormModal } from '../../src/components/ConnectionFormModal'

const noop = async () => ({ ok: true, ms: 1 })

test('create mode: fills form and submits ConnectionFormInput', async () => {
  const onSubmit = mock(async () => {})
  render(<ConnectionFormModal mode="create" onSubmit={onSubmit} onTest={noop} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('連線名稱'), { target: { value: 'staging' } })
  fireEvent.change(screen.getByLabelText('主機'), { target: { value: 'db.stg' } })
  fireEvent.change(screen.getByLabelText('連接埠'), { target: { value: '5432' } })
  fireEvent.change(screen.getByLabelText('使用者'), { target: { value: 'app' } })
  fireEvent.change(screen.getByLabelText('資料庫'), { target: { value: 'app' } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'p' } })
  fireEvent.click(screen.getByRole('button', { name: '儲存' }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'staging', host: 'db.stg', port: 5432, user: 'app', database: 'app', password: 'p' })
})

test('edit mode: name is read-only and password placeholder says blank=unchanged', () => {
  render(<ConnectionFormModal mode="edit"
    initial={{ name: 'primary', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }}
    onSubmit={async () => {}} onTest={noop} onClose={() => {}} />)
  expect(screen.getByLabelText('連線名稱')).toBeDisabled()
  expect(screen.getByLabelText('密碼')).toHaveAttribute('placeholder', expect.stringContaining('留白'))
})

test('測試連線 shows the result', async () => {
  render(<ConnectionFormModal mode="create" onSubmit={async () => {}} onTest={async () => ({ ok: true, ms: 7 })} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('主機'), { target: { value: 'h' } })
  fireEvent.change(screen.getByLabelText('連接埠'), { target: { value: '3306' } })
  fireEvent.change(screen.getByLabelText('使用者'), { target: { value: 'u' } })
  fireEvent.change(screen.getByLabelText('資料庫'), { target: { value: 'd' } })
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  await waitFor(() => expect(screen.getByText(/成功/)).toBeTruthy())
})
```

> 測試 helper:確認 `tests/frontend/happydom.ts` 已 register(其餘前端測一致)。`@testing-library/jest-dom` matcher(`toBeDisabled`/`toHaveAttribute`)若該專案未裝,改用原生斷言:`expect((screen.getByLabelText('連線名稱') as HTMLInputElement).disabled).toBe(true)`、`expect(el.getAttribute('placeholder'))`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/ConnectionFormModal.test.tsx`
Expected: FAIL — 模組不存在。

- [ ] **Step 3: 寫實作**

`src/components/ConnectionFormModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { ConnectionFormInput, ConnectionDetail, SqlSystem, TestResult } from '../api/types'

export interface ConnectionFormModalProps {
  mode: 'create' | 'edit'
  initial?: ConnectionDetail
  onSubmit(input: ConnectionFormInput): Promise<void>
  onTest(input: Omit<ConnectionFormInput, 'name'>): Promise<TestResult>
  onClose(): void
}

const SYSTEMS: SqlSystem[] = ['mysql', 'postgresql', 'mariadb']
const DEFAULT_PORT: Record<SqlSystem, number> = { mysql: 3306, mariadb: 3306, postgresql: 5432 }

export function ConnectionFormModal({ mode, initial, onSubmit, onTest, onClose }: ConnectionFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [system, setSystem] = useState<SqlSystem>(initial?.system ?? 'mysql')
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState(String(initial?.port ?? DEFAULT_PORT[initial?.system ?? 'mysql']))
  const [user, setUser] = useState(initial?.user ?? '')
  const [database, setDatabase] = useState(initial?.database ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const collect = (): ConnectionFormInput => ({
    name, system, host, port: Number(port), user, database,
    ...(password !== '' ? { password } : {}),
  })

  const submit = async () => {
    setBusy(true); setTestMsg(null)
    try { await onSubmit(collect()); onClose() }
    catch { /* 錯誤由上層 error channel 顯示 */ }
    finally { setBusy(false) }
  }

  const test = async () => {
    setBusy(true); setTestMsg(null)
    try {
      const r = await onTest({ system, host, port: Number(port), user, database, ...(password !== '' ? { password } : {}) })
      setTestMsg({ ok: true, text: `連線成功 · ${r.ms}ms` })
    } catch (err) {
      setTestMsg({ ok: false, text: err instanceof Error ? err.message : '連線失敗' })
    } finally { setBusy(false) }
  }

  const field = 'w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors'

  return (
    <div role="dialog" aria-modal="true" aria-label={mode === 'create' ? '新增連線' : '編輯連線'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="flex w-full max-w-md flex-col rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/40">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{mode === 'create' ? '新增連線' : '編輯連線'}</span>
          <button type="button" aria-label="關閉" onClick={onClose} className="rounded-full p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex flex-col gap-2.5 px-4 py-4">
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">連線名稱
            <input aria-label="連線名稱" className={field} value={name} disabled={mode === 'edit'} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">系統
            <select aria-label="系統" className={field} value={system}
              onChange={(e) => { const s = e.target.value as SqlSystem; setSystem(s); if (!initial) setPort(String(DEFAULT_PORT[s])) }}>
              {SYSTEMS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">主機
              <input aria-label="主機" className={field} value={host} onChange={(e) => setHost(e.target.value)} />
            </label>
            <label className="flex w-24 flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">連接埠
              <input aria-label="連接埠" type="number" className={field} value={port} onChange={(e) => setPort(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">使用者
            <input aria-label="使用者" className={field} value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">密碼
            <input aria-label="密碼" type="password" className={field} value={password}
              placeholder={mode === 'edit' ? '•••• 留白代表不修改' : ''} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">資料庫
            <input aria-label="資料庫" className={field} value={database} onChange={(e) => setDatabase(e.target.value)} />
          </label>
          {testMsg && (
            <p className={`text-xs ${testMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{testMsg.text}</p>
          )}
        </div>

        <footer className="flex justify-between gap-2 border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/40">
          <button type="button" disabled={busy} onClick={test} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">測試連線</button>
          <button type="button" disabled={busy} onClick={submit} className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer">儲存</button>
        </footer>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/ConnectionFormModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ConnectionFormModal.tsx tests/frontend/ConnectionFormModal.test.tsx
git commit -m "feat: [frontend] ConnectionFormModal (create/edit + test connection)"
```

---

## Task 8: Sidebar 入口 + App 接線

**Files:**
- Modify: `src/views/Sidebar.tsx`
- Modify: `src/App.tsx`
- Test: `tests/frontend/Sidebar.test.tsx`(加案例)

- [ ] **Step 1: 寫失敗測試**

在 `tests/frontend/Sidebar.test.tsx` 加(沿用該檔既有 render helper):

```typescript
test('header + button triggers onAddConnection', () => {
  const onAdd = mock(() => {})
  render(<Sidebar connections={[{ name: 'primary', system: 'mysql', isDefault: true }]}
    activeConnectionId={null} tree={[]} expandedColumns={{}}
    onSelectConnection={() => {}} onLoadColumns={() => {}} onInsertSelect={() => {}}
    onAddConnection={onAdd} onEditConnection={() => {}} onDeleteConnection={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '新增連線' }))
  expect(onAdd).toHaveBeenCalledTimes(1)
})

test('per-connection edit / delete buttons fire with the name', () => {
  const onEdit = mock((_: string) => {}); const onDelete = mock((_: string) => {})
  render(<Sidebar connections={[{ name: 'primary', system: 'mysql', isDefault: true }]}
    activeConnectionId={null} tree={[]} expandedColumns={{}}
    onSelectConnection={() => {}} onLoadColumns={() => {}} onInsertSelect={() => {}}
    onAddConnection={() => {}} onEditConnection={onEdit} onDeleteConnection={onDelete} />)
  fireEvent.click(screen.getByRole('button', { name: '編輯連線 primary' }))
  fireEvent.click(screen.getByRole('button', { name: '刪除連線 primary' }))
  expect(onEdit).toHaveBeenCalledWith('primary')
  expect(onDelete).toHaveBeenCalledWith('primary')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/Sidebar.test.tsx`
Expected: FAIL — props 不存在 / 找不到按鈕。

- [ ] **Step 3: 寫實作**

`src/views/Sidebar.tsx`:① `SidebarProps` 加 `onAddConnection(): void`、`onEditConnection(name: string): void`、`onDeleteConnection(name: string): void`;② 標題列加 `+`;③ 每條連線列(`<li>`)包成 group,加 hover ✎/🗑。

把「連線列表」section header 改為:

```tsx
<h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500 tracking-wider">
  <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> 連線列表</span>
  <button type="button" aria-label="新增連線" onClick={props.onAddConnection}
    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 cursor-pointer">
    <Plus className="h-3.5 w-3.5" />
  </button>
</h2>
```

連線 `<li>` 內,把單一 `<button>` 改為 group + 動作鈕(保留原選擇行為):

```tsx
<li key={c.name} className="group flex items-center gap-1">
  <button type="button" onClick={() => props.onSelectConnection(c.name)}
    className={`flex flex-1 items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors cursor-pointer text-xs ${
      c.name === activeConnectionId ? 'bg-blue-50 text-blue-600 font-semibold dark:bg-blue-950/40 dark:text-blue-400'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
    <span>{c.name}</span>
    {c.isDefault ? <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[10px] text-slate-400 font-medium">預設</span> : null}
  </button>
  <span className="flex opacity-0 group-hover:opacity-100 transition-opacity">
    <button type="button" aria-label={`編輯連線 ${c.name}`} onClick={() => props.onEditConnection(c.name)}
      className="rounded p-1 text-slate-400 hover:text-blue-600 cursor-pointer"><Pencil className="h-3 w-3" /></button>
    <button type="button" aria-label={`刪除連線 ${c.name}`} onClick={() => props.onDeleteConnection(c.name)}
      className="rounded p-1 text-slate-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
  </span>
</li>
```

import 補:`import { Table2, Eye, Play, Database, KeyRound, Search, Plus, Pencil, Trash2 } from 'lucide-react'`。

`src/App.tsx`:加 modal 狀態 + 接 hook,並把新 props 傳給 `Sidebar`:

```tsx
import { ConnectionFormModal } from './components/ConnectionFormModal'
import type { ConnectionDetail } from './api/types'
// App 內:
const [connModal, setConnModal] = useState<{ mode: 'create' | 'edit'; initial?: ConnectionDetail } | null>(null)

const openEdit = async (name: string) => {
  try { setConnModal({ mode: 'edit', initial: await conn.getConnection(name) }) }
  catch { /* 錯誤已進 error channel */ }
}
const removeConn = async (name: string) => {
  if (!window.confirm(`確定刪除連線「${name}」?`)) return
  await conn.deleteConnection(name).catch(() => {})
}

// Sidebar props 補:
//   onAddConnection={() => setConnModal({ mode: 'create' })}
//   onEditConnection={openEdit}
//   onDeleteConnection={removeConn}

// 在最外層 div 末端(drag shield 之後)掛:
{connModal && (
  <ConnectionFormModal
    mode={connModal.mode}
    initial={connModal.initial}
    onSubmit={connModal.mode === 'create' ? conn.createConnection : conn.updateConnection}
    onTest={conn.testConnection}
    onClose={() => setConnModal(null)}
  />
)}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/Sidebar.test.tsx && bunx tsc --noEmit`
Expected: Sidebar 測綠;tsc 全綠(App 接線型別正確)。

- [ ] **Step 5: Commit**

```bash
git add src/views/Sidebar.tsx src/App.tsx tests/frontend/Sidebar.test.tsx
git commit -m "feat: [frontend] connection-list add/edit/delete entry points + modal wiring"
```

---

# Phase D — E2E + 文件

## Task 9: E2E 旅程

**Files:**
- Modify: `tests/e2e/serve-fixture.ts`
- Create: `tests/e2e/journeys/connections.e2e.ts`

- [ ] **Step 1: 寫失敗測試 + 擴 fixture**

`tests/e2e/serve-fixture.ts` 改為建 temp `.dbcli` + 傳 `dbcliPath` + 注入永遠成功的 `createAdapter`。在現有 `createServer({...})` 之前插入:

```typescript
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeV2Config, writeProjectBinding, getProjectStoragePath } from '@carllee1983/dbcli/core'

const E2E_PROJECT = join(tmpdir(), 'dbcli-gui-e2e', '.dbcli')
await Bun.$`rm -rf ${join(tmpdir(), 'dbcli-gui-e2e')}`
await Bun.$`mkdir -p ${E2E_PROJECT}`
await writeProjectBinding(E2E_PROJECT, getProjectStoragePath(E2E_PROJECT))
await writeV2Config(E2E_PROJECT, {
  version: 2, default: 'main',
  connections: { main: { system: 'mysql', host: 'localhost', port: 3306, user: 'root',
    password: { $env: 'DBCLI_MAIN_PASSWORD' }, database: 'shop', permission: 'query-only', envFile: '.env.main' } },
  schema: {}, schemas: {}, metadata: { version: '2.0' },
  blacklist: { tables: [], columns: {} },
  audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
} as never)
```

並把 `createServer({ ... })` 改為傳 `dbcliPath: E2E_PROJECT`,且 `listConnections` 改為從真 config 讀(讓新增的連線出現在列表):

```typescript
import { readV2Config, listConnections as coreList } from '@carllee1983/dbcli/core'
// ...
createServer({
  pool,
  token: TOKEN,
  port: SIDECAR_PORT,
  dbcliPath: E2E_PROJECT,
  listConnections: async () => coreList(await readV2Config(E2E_PROJECT)).map((c) => ({ name: c.name, system: c.system, isDefault: c.isDefault })),
})
```

> test 路由在 E2E 會真的試連 localhost:3306(無 DB)→ 預期失敗。本旅程**不點測試連線**,只驗 CRUD + 列表,避免依賴真 DB。(若要驗測試成功路徑,另需注入假 adapter 的 fixture 變體,本期不做。)

`tests/e2e/journeys/connections.e2e.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('add → appears in list → set default → edit → delete', async ({ page }) => {
  await page.goto(APP_PATH)

  // 開新增連線 modal
  await page.getByRole('button', { name: '新增連線' }).click()
  await page.getByLabel('連線名稱').fill('reporting')
  await page.getByLabel('主機').fill('localhost')
  await page.getByLabel('連接埠').fill('3306')
  await page.getByLabel('使用者').fill('root')
  await page.getByLabel('資料庫').fill('shop')
  await page.getByLabel('密碼').fill('pw')
  await page.getByRole('button', { name: '儲存' }).click()

  // 出現在側邊連線列表
  await expect(page.getByRole('button', { name: 'reporting' })).toBeVisible()

  // 編輯:改主機
  await page.getByRole('button', { name: '編輯連線 reporting' }).click()
  await expect(page.getByLabel('連線名稱')).toBeDisabled()
  await page.getByLabel('主機').fill('db.internal')
  await page.getByRole('button', { name: '儲存' }).click()

  // 刪除(confirm 自動接受)
  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: '刪除連線 reporting' }).click()
  await expect(page.getByRole('button', { name: 'reporting' })).toHaveCount(0)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun run e2e tests/e2e/journeys/connections.e2e.ts`
Expected: FAIL(初次:fixture 尚未含 dbcliPath / 路由,或選擇器未到位)。

- [ ] **Step 3: 修到綠**

依失敗訊息調整(fixture 接線、`getByRole` 名稱)。Phase B/C 已實作對應後端與 UI,主要是 fixture 串接。

- [ ] **Step 4: 跑全 E2E 確認通過**

Run: `bun run e2e`
Expected: 既有旅程 + 新 `connections` 旅程全綠。

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/serve-fixture.ts tests/e2e/journeys/connections.e2e.ts
git commit -m "test: [e2e] connection management journey (add/edit/delete/list)"
```

---

## Task 10: README + 全驗收

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 補 README**

在 `## v1.x 易用性` 之後加一段:

```markdown
## v2 ‧ 連線管理

- **GUI 內管理連線**:側邊「連線列表」標題列 `+` 新增、每條連線 hover 可編輯/刪除。
- **置中表單**:SQL 三系統(mysql/postgresql/mariadb)結構化欄位 + 「測試連線」即時驗證。
- **安全寫回 `.dbcli`**:透過 `@carllee1983/dbcli/core`(>=1.30.0)的連線 writer 寫 v2 多連線設定;密碼存連線專屬 env 檔(`{$env}` 參照、per-connection 命名空間),編輯時留白代表不修改、真實密碼不回傳前端。
- **v1 自動升級**:對既有 v1 單連線專案新增第二條連線時,自動 migrate 成 v2。
```

- [ ] **Step 2: 全綠驗收**

Run:
```bash
bun test
bunx tsc --noEmit
bun run e2e
```
Expected: 全綠。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: [v2] README 連線管理段落"
```

---

## Self-Review 註記

- **Spec 覆蓋**:6 路由(Task 2/3/4)、表單(Task 7)、入口(Task 8)、client/hook(Task 5/6)、E2E(Task 9)、密碼留白=不變(Task 2 update 測 + Task 7 placeholder)、刪預設改派/擋最後一條(Task 2 測)、v1→v2(`loadV2` migrate 分支,Task 2)、原子寫(Task 2 註記指向計畫 1)。
- **跨計畫相依**:Task 1 Step 1 bump `@carllee1983/dbcli@^1.30.0`;Task 2 Step 2 提醒計畫 1 須一併匯出 `writeProjectBinding`/`getProjectStoragePath`(測試用)。**執行計畫 1 時請把這兩個 binding 函式也加進 `public.ts` 匯出**(計畫 1 Task 6)。
- **型別一致**:`ConnectionFormInput`(前端)↔ `ConnectionInputBody`(sidecar)↔ `ConnectionInput`(core)欄位對齊(name/system/host/port/user/database/password?);`TestResult { ok; ms }` 前後端一致。
- **已知簡化(已 log)**:E2E 不驗「測試連線成功」路徑(需真 DB 或假 adapter fixture 變體),僅驗 CRUD + 列表;Mongo/Redis/ES 不在本期。
```
