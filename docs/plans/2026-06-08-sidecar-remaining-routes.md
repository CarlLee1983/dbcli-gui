# dbcli-gui Bun Sidecar — Remaining Routes (list / schema / export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Bun sidecar HTTP surface by adding the four routes deferred from the core-loop plan — `/connections/list`, `/schema/tree`, `/schema/table`, `/export` — and enriching `/query` to the design's `{ rows, fields, rowCount, ms }` contract, all behind the existing bearer auth and with blacklist enforcement.

**Architecture:** Same single Bun process and patterns as the core loop. New route handlers live in `sidecar/routes/*` as factory functions that receive the `ConnectionPool` (or an injectable lister) so every test runs end-to-end with a fake adapter — no database, no `.dbcli` fixture. Schema browsing reads **live** from the pooled adapter (`listTables` / `getTableSchema`), not from the on-disk schema cache. Blacklisted tables are hidden from the tree and rejected on direct lookup; blacklisted columns are stripped from table schemas. Export reuses the same forced query-only `QueryExecutor` path as `/query`, then serializes rows to CSV or JSON.

**Tech Stack:** Bun (`Bun.serve`, `bun test`), TypeScript, zod v3, `@carllee1983/dbcli/core` (`QueryExecutor`, `BlacklistManager`, `BlacklistValidator`, `readV2Config`, `listConnections`, types `DatabaseAdapter`/`TableSchema`/`DbcliConfig`/`DbcliConfigV2`).

**Scope:** The four deferred routes + `/query` enrichment. NOT in scope: the React frontend, the Tauri shell, streaming export bodies (v1 returns a complete body — streaming is a v2 concern), v1-format `.dbcli` connection listing (`/connections/list` is v2-only; v1 single-connection projects are out of scope per the multi-connection GUI design). Design reference: `docs/dbcli-gui-design.md` §4.2.

---

## File Structure

- `shared/schemas.ts` — **modify**. Add `SchemaTreeBody`, `SchemaTableBody`, `ExportBody` zod schemas (request bodies for the new routes).
- `sidecar/routes/query.ts` — **modify**. Enrich the success response to `{ rows, fields, rowCount, ms }`.
- `sidecar/routes/connections.ts` — **modify**. Add `ConnectionLister` type, `makeListHandler(lister?)`, and `defaultConnectionLister(dbcliPath)`.
- `sidecar/routes/schema.ts` — **create**. `makeSchemaHandlers(pool)` → `{ tree, table }`. Live introspection + blacklist filtering.
- `sidecar/routes/export.ts` — **create**. `makeExportHandler(pool)` + `toCsv()` serializer.
- `sidecar/server.ts` — **modify**. Add optional `listConnections` to `ServerDeps`; wire the four new routes through the existing `guard`.
- `sidecar/index.ts` — **modify**. Build and pass the real `defaultConnectionLister(cfg.dbcliPath)`.
- `tests/sidecar/query-route.test.ts` — **modify**. Add an assertion that `/query` returns `fields` + `ms`.
- `tests/sidecar/connections-list-route.test.ts` — **create**.
- `tests/sidecar/schema-route.test.ts` — **create**.
- `tests/sidecar/export-route.test.ts` — **create**.

**Conventions (unchanged from the core loop):** `Bun.serve({ port, routes, fetch })`; handlers are `(req: Request) => Response | Promise<Response>`; POST bodies are JSON validated with zod; `json()` lives in `sidecar/http.ts` and is imported by route modules; protected routes go through `guard(token, handler)`. Keep files focused (<300 lines).

---

## Task 1: Enrich `/query` response to `{ rows, fields, rowCount, ms }`

The design (§4.2) specifies `/query → { rows, fields, rowCount, ms }`. The current handler returns only `{ rows, rowCount }`. `QueryResult` already carries `columnNames` (ordered) and `executionTimeMs`, so this is a pure additive change the frontend ResultGrid needs for column ordering and timing.

**Files:**
- Modify: `sidecar/routes/query.ts:26`
- Test: `tests/sidecar/query-route.test.ts` (add one test)

- [ ] **Step 1: Add the failing assertion**

Append this test to `tests/sidecar/query-route.test.ts` (it reuses the `start`/`post` helpers already in that file):

```ts
test('SELECT response includes ordered fields and ms timing', async () => {
  const s = start([{ id: 1, name: 'a' }])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/query', { connectionId: 'main', sql: 'SELECT * FROM t' })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.fields).toEqual(['id', 'name'])
  expect('ms' in body).toBe(true) // number, or null when the adapter reports no timing
})
```

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/query-route.test.ts`
Expected: FAIL — `body.fields` is `undefined`.

- [ ] **Step 3: Enrich the response**

In `sidecar/routes/query.ts`, replace the success return line (currently `return json({ rows: result.rows, rowCount: result.rowCount })`) with:

```ts
      return json({
        rows: result.rows,
        fields: result.columnNames,
        rowCount: result.rowCount,
        ms: result.executionTimeMs ?? null,
      })
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/sidecar/query-route.test.ts`
Expected: PASS (all existing query tests + the new one).

- [ ] **Step 5: Commit**

```bash
git add sidecar/routes/query.ts tests/sidecar/query-route.test.ts
git commit -m "feat: [sidecar] /query returns ordered fields + ms timing"
```

---

## Task 2: Request schemas for the new routes

**Files:**
- Modify: `shared/schemas.ts`
- Test: `tests/sidecar/foundation.test.ts` (add schema cases)

- [ ] **Step 1: Add the failing tests**

Append to `tests/sidecar/foundation.test.ts` (the import line for schemas already exists — extend it to include the new schemas):

```ts
import { SchemaTreeBody, SchemaTableBody, ExportBody } from '../../shared/schemas'

test('SchemaTreeBody requires connectionId', () => {
  expect(SchemaTreeBody.safeParse({}).success).toBe(false)
  expect(SchemaTreeBody.safeParse({ connectionId: 'main' }).success).toBe(true)
})

test('SchemaTableBody requires connectionId and table', () => {
  expect(SchemaTableBody.safeParse({ connectionId: 'main' }).success).toBe(false)
  expect(SchemaTableBody.safeParse({ connectionId: 'main', table: 'users' }).success).toBe(true)
})

test('ExportBody requires a valid format', () => {
  expect(ExportBody.safeParse({ connectionId: 'c', sql: 'SELECT 1' }).success).toBe(false)
  expect(ExportBody.safeParse({ connectionId: 'c', sql: 'SELECT 1', format: 'xml' }).success).toBe(false)
  expect(ExportBody.safeParse({ connectionId: 'c', sql: 'SELECT 1', format: 'csv' }).success).toBe(true)
  expect(ExportBody.safeParse({ connectionId: 'c', sql: 'SELECT 1', format: 'json' }).success).toBe(true)
})
```

> Note: if `tests/sidecar/foundation.test.ts` already imports from `'../../shared/schemas'`, merge the new names into that existing import rather than adding a duplicate import line.

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/foundation.test.ts`
Expected: FAIL — `SchemaTreeBody`/`SchemaTableBody`/`ExportBody` are not exported.

- [ ] **Step 3: Add the schemas**

Append to `shared/schemas.ts` (after the existing `QueryBody` block, before or after the `z.infer` exports — keep all `z.infer` exports together at the bottom):

```ts
export const SchemaTreeBody = z.object({ connectionId: z.string().min(1) })
export const SchemaTableBody = z.object({
  connectionId: z.string().min(1),
  table: z.string().min(1),
})
export const ExportBody = z.object({
  connectionId: z.string().min(1),
  sql: z.string().min(1),
  format: z.enum(['csv', 'json']),
  limit: z.number().int().positive().optional(),
})

export type SchemaTreeBody = z.infer<typeof SchemaTreeBody>
export type SchemaTableBody = z.infer<typeof SchemaTableBody>
export type ExportBody = z.infer<typeof ExportBody>
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/sidecar/foundation.test.ts`
Expected: PASS (existing foundation tests + the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add shared/schemas.ts tests/sidecar/foundation.test.ts
git commit -m "feat: [sidecar] request schemas for schema/tree, schema/table, export"
```

---

## Task 3: `/connections/list` (v2 `.dbcli`, no secrets)

Reads the project's v2 `.dbcli` config and returns connection names + system + default flag — never host/port/credentials. The handler takes an injectable `ConnectionLister` so tests run without a `.dbcli` fixture; `index.ts` wires the real disk-backed lister.

**Files:**
- Modify: `sidecar/routes/connections.ts`
- Modify: `sidecar/server.ts`
- Test: `tests/sidecar/connections-list-route.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sidecar/connections-list-route.test.ts`:

```ts
import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig
const fakeAdapter = { connect: async () => {}, disconnect: async () => {}, execute: async () => ({ rows: [] }) } as unknown as DatabaseAdapter

let server: ReturnType<typeof createServer> | undefined
afterEach(() => server?.stop(true))

function start(listConnections?: () => Promise<Array<{ name: string; system: string; isDefault: boolean }>>) {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter })
  server = createServer({ pool, token: 'test', port: 0, listConnections })
  return server
}
const post = (s: ReturnType<typeof createServer>, path: string, body: unknown, auth = 'Bearer test') =>
  fetch(`http://localhost:${s.port}${path}`, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('POST /connections/list without auth returns 401', async () => {
  const s = start(async () => [])
  const res = await post(s, '/connections/list', {}, 'Bearer wrong')
  expect(res.status).toBe(401)
})

test('POST /connections/list returns connections without secrets', async () => {
  const s = start(async () => [
    { name: 'prod', system: 'postgresql', isDefault: true },
    { name: 'staging', system: 'mysql', isDefault: false },
  ])
  const res = await post(s, '/connections/list', {})
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.connections).toEqual([
    { name: 'prod', system: 'postgresql', isDefault: true },
    { name: 'staging', system: 'mysql', isDefault: false },
  ])
  // Defense-in-depth: no credential-ish keys leak through.
  expect(JSON.stringify(body)).not.toContain('password')
})

test('POST /connections/list returns 500 when the config cannot be read', async () => {
  const s = start(async () => { throw new Error('no .dbcli here') })
  const res = await post(s, '/connections/list', {})
  expect(res.status).toBe(500)
  expect((await res.json()).error.code).toBe('INTERNAL')
})

test('POST /connections/list returns 501 when no lister is configured', async () => {
  const s = start(undefined)
  const res = await post(s, '/connections/list', {})
  expect(res.status).toBe(501)
  expect((await res.json()).error.code).toBe('NOT_CONFIGURED')
})
```

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/connections-list-route.test.ts`
Expected: FAIL — `createServer` does not accept `listConnections`; route not registered.

- [ ] **Step 3: Add lister type, default lister, and list handler to `sidecar/routes/connections.ts`**

Add these imports at the top of `sidecar/routes/connections.ts` (merge with the existing import lines):

```ts
import { readV2Config, listConnections } from '@carllee1983/dbcli/core'
```

Then append to the file:

```ts
export interface ConnectionSummary {
  name: string
  system: string
  isDefault: boolean
}

/** Lists project connections without exposing host/port/credentials. */
export type ConnectionLister = () => Promise<ConnectionSummary[]>

/** Default lister: read the v2 `.dbcli` config and project name/system/default. */
export function defaultConnectionLister(dbcliPath: string): ConnectionLister {
  return async () => {
    const config = await readV2Config(dbcliPath)
    return listConnections(config).map((c) => ({
      name: c.name,
      system: c.system,
      isDefault: c.isDefault,
    }))
  }
}

/** Handler for POST /connections/list. Returns 501 when no lister is wired. */
export function makeListHandler(lister?: ConnectionLister) {
  return async function list(_req: Request): Promise<Response> {
    if (!lister) {
      return json({ error: { code: 'NOT_CONFIGURED', message: 'connection listing not configured' } }, 501)
    }
    try {
      return json({ connections: await lister() })
    } catch (err) {
      return json(toErrorBody(err), 500)
    }
  }
}
```

> `json` and `toErrorBody` are already imported at the top of `connections.ts` (the existing open/close handlers use them). If not, add `import { json } from '../http'` and `import { toErrorBody } from '../../shared/errors'`.

- [ ] **Step 4: Wire the route into `sidecar/server.ts`**

Add to the imports:

```ts
import { makeConnectionHandlers, makeListHandler, type ConnectionLister } from './routes/connections'
```

(adjust the existing `makeConnectionHandlers` import to this combined line).

Add `listConnections` to `ServerDeps`:

```ts
export interface ServerDeps {
  pool: ConnectionPool
  token: string
  port: number
  listConnections?: ConnectionLister
}
```

Register the route inside the `routes` object (after `/connections/close`):

```ts
      '/connections/list': { POST: guard(deps.token, makeListHandler(deps.listConnections)) },
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `bun test tests/sidecar/connections-list-route.test.ts tests/sidecar/connections-route.test.ts`
Expected: PASS (4 new list tests; existing open/close tests still green).

- [ ] **Step 6: Commit**

```bash
git add sidecar/routes/connections.ts sidecar/server.ts tests/sidecar/connections-list-route.test.ts
git commit -m "feat: [sidecar] /connections/list (v2 config, no secrets)"
```

---

## Task 4: `/schema/tree` + `/schema/table` (live introspection + blacklist)

Browse schema live from the pooled adapter. The tree hides blacklisted tables; a direct lookup of a blacklisted table is rejected (403, don't leak its schema); blacklisted columns are stripped from a returned table schema.

**Files:**
- Create: `sidecar/routes/schema.ts`
- Modify: `sidecar/server.ts`
- Test: `tests/sidecar/schema-route.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sidecar/schema-route.test.ts`:

```ts
import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter, TableSchema } from '@carllee1983/dbcli/core'

// Config with a blacklist: table "secrets" is hidden; column "password" on "users" is stripped.
const fakeConfig = {
  connection: { system: 'postgresql' },
  permission: 'read-write',
  blacklist: { tables: ['secrets'], columns: { users: ['password'] } },
} as unknown as DbcliConfig

const TABLES: TableSchema[] = [
  { name: 'users', columns: [], columnCount: 3, tableType: 'table', rowCount: 10 },
  { name: 'secrets', columns: [], columnCount: 2, tableType: 'table' },
  { name: 'active_users', columns: [], columnCount: 1, tableType: 'view' },
]

const USERS_SCHEMA: TableSchema = {
  name: 'users',
  columns: [
    { name: 'id', type: 'int', nullable: false, primaryKey: true },
    { name: 'email', type: 'text', nullable: false },
    { name: 'password', type: 'text', nullable: false },
  ],
  primaryKey: ['id'],
}

function fakeAdapter(): DatabaseAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    execute: async () => ({ rows: [] }),
    listTables: async () => TABLES,
    getTableSchema: async (name: string) => (name === 'users' ? USERS_SCHEMA : { name, columns: [] }),
  } as unknown as DatabaseAdapter
}

let server: ReturnType<typeof createServer> | undefined
afterEach(() => server?.stop(true))

function start() {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter() })
  server = createServer({ pool, token: 'test', port: 0 })
  return server
}
const post = (s: ReturnType<typeof createServer>, path: string, body: unknown) =>
  fetch(`http://localhost:${s.port}${path}`, { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('POST /schema/tree on an unopened connection returns 409', async () => {
  const s = start()
  const res = await post(s, '/schema/tree', { connectionId: 'missing' })
  expect(res.status).toBe(409)
  expect((await res.json()).error.code).toBe('NOT_OPEN')
})

test('POST /schema/tree lists tables, hides blacklisted ones, and maps type', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/tree', { connectionId: 'main' })
  expect(res.status).toBe(200)
  const body = await res.json()
  const names = body.tables.map((t: { name: string }) => t.name)
  expect(names).toEqual(['users', 'active_users']) // "secrets" hidden
  const view = body.tables.find((t: { name: string }) => t.name === 'active_users')
  expect(view.type).toBe('view')
  const users = body.tables.find((t: { name: string }) => t.name === 'users')
  expect(users.type).toBe('table')
  expect(users.columnCount).toBe(3)
})

test('POST /schema/table strips blacklisted columns', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/table', { connectionId: 'main', table: 'users' })
  expect(res.status).toBe(200)
  const body = await res.json()
  const cols = body.table.columns.map((c: { name: string }) => c.name)
  expect(cols).toEqual(['id', 'email']) // "password" stripped
})

test('POST /schema/table on a blacklisted table returns 403', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/table', { connectionId: 'main', table: 'secrets' })
  expect(res.status).toBe(403)
  expect((await res.json()).error.code).toBe('BLACKLISTED')
})

test('POST /schema/table with missing table returns 400', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/table', { connectionId: 'main' })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/schema-route.test.ts`
Expected: FAIL — routes not registered.

- [ ] **Step 3: Implement `sidecar/routes/schema.ts`**

```ts
import { BlacklistManager, BlacklistError } from '@carllee1983/dbcli/core'
import type { ConnectionPool } from '../connection-pool'
import { SchemaTreeBody, SchemaTableBody } from '../../shared/schemas'
import { toErrorBody } from '../../shared/errors'
import { json } from '../http'

export function makeSchemaHandlers(pool: ConnectionPool) {
  return {
    async tree(req: Request): Promise<Response> {
      const parsed = SchemaTreeBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId required' } }, 400)

      const entry = pool.get(parsed.data.connectionId)
      if (!entry) return json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409)

      try {
        const manager = new BlacklistManager(entry.config)
        const tables = await entry.adapter.listTables()
        const visible = tables
          .filter((t) => !manager.isTableBlacklisted(t.name))
          .map((t) => ({
            name: t.name,
            type: t.tableType ?? 'table',
            columnCount: t.columnCount,
            rowCount: t.rowCount ?? t.estimatedRowCount,
          }))
        return json({ tables: visible })
      } catch (err) {
        return json(toErrorBody(err), 500)
      }
    },

    async table(req: Request): Promise<Response> {
      const parsed = SchemaTableBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId + table required' } }, 400)

      const entry = pool.get(parsed.data.connectionId)
      if (!entry) return json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409)

      const manager = new BlacklistManager(entry.config)
      // Reject before touching the DB so a protected table's schema never leaks.
      if (manager.isTableBlacklisted(parsed.data.table)) {
        return json(toErrorBody(new BlacklistError(`${parsed.data.table} is protected`)), 403)
      }

      try {
        const schema = await entry.adapter.getTableSchema(parsed.data.table)
        const blacklisted = new Set(manager.getBlacklistedColumns(parsed.data.table))
        const columns = schema.columns.filter((c) => !blacklisted.has(c.name))
        return json({ table: { ...schema, columns } })
      } catch (err) {
        return json(toErrorBody(err), 500)
      }
    },
  }
}
```

- [ ] **Step 4: Wire the routes into `sidecar/server.ts`**

Add the import:

```ts
import { makeSchemaHandlers } from './routes/schema'
```

Inside `createServer`, after building `conn`, add:

```ts
  const schema = makeSchemaHandlers(deps.pool)
```

Register the routes inside the `routes` object (after `/query`):

```ts
      '/schema/tree': { POST: guard(deps.token, schema.tree) },
      '/schema/table': { POST: guard(deps.token, schema.table) },
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `bun test tests/sidecar/schema-route.test.ts`
Expected: PASS (5 tests). The blacklist hide/strip/reject behavior is proven end-to-end through HTTP with a fake adapter.

- [ ] **Step 6: Commit**

```bash
git add sidecar/routes/schema.ts sidecar/server.ts tests/sidecar/schema-route.test.ts
git commit -m "feat: [sidecar] /schema/tree + /schema/table (live introspection, blacklist filtered)"
```

---

## Task 5: `/export` (CSV / JSON serialization)

Runs the same forced query-only `QueryExecutor` path as `/query`, then serializes the rows. CSV uses the ordered `columnNames` for the header and RFC-4180 quoting; JSON returns a pretty-printed array. Response carries a `content-disposition: attachment` header so the frontend can save it. v1 returns a complete body (no streaming).

**Files:**
- Create: `sidecar/routes/export.ts`
- Modify: `sidecar/server.ts`
- Test: `tests/sidecar/export-route.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sidecar/export-route.test.ts`:

```ts
import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig

function fakeAdapter(rows: Array<Record<string, unknown>>): DatabaseAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    execute: async () => ({ rows }),
  } as unknown as DatabaseAdapter
}

let server: ReturnType<typeof createServer> | undefined
afterEach(() => server?.stop(true))

function start(rows: Array<Record<string, unknown>>) {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter(rows) })
  server = createServer({ pool, token: 'test', port: 0 })
  return server
}
const post = (s: ReturnType<typeof createServer>, path: string, body: unknown) =>
  fetch(`http://localhost:${s.port}${path}`, { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('export csv returns a header row, quoting, and attachment headers', async () => {
  const s = start([
    { id: 1, note: 'plain' },
    { id: 2, note: 'has, comma' },
    { id: 3, note: 'has "quote"' },
  ])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/export', { connectionId: 'main', sql: 'SELECT * FROM t', format: 'csv' })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/csv')
  expect(res.headers.get('content-disposition')).toContain('attachment')
  const text = await res.text()
  expect(text).toBe('id,note\n1,plain\n2,"has, comma"\n3,"has ""quote"""')
})

test('export json returns a JSON array with attachment headers', async () => {
  const s = start([{ id: 1 }, { id: 2 }])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/export', { connectionId: 'main', sql: 'SELECT * FROM t', format: 'json' })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('application/json')
  expect(res.headers.get('content-disposition')).toContain('attachment')
  expect(await res.json()).toEqual([{ id: 1 }, { id: 2 }])
})

test('export on an unopened connection returns 409', async () => {
  const s = start([])
  const res = await post(s, '/export', { connectionId: 'missing', sql: 'SELECT 1', format: 'csv' })
  expect(res.status).toBe(409)
  expect((await res.json()).error.code).toBe('NOT_OPEN')
})

test('export rejects a write statement (forced query-only)', async () => {
  const s = start([])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/export', { connectionId: 'main', sql: 'DELETE FROM users', format: 'csv' })
  expect(res.status).toBe(403)
  expect((await res.json()).error.code).toBe('PERMISSION')
})

test('export with an invalid format returns 400', async () => {
  const s = start([])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/export', { connectionId: 'main', sql: 'SELECT 1', format: 'xml' })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/export-route.test.ts`
Expected: FAIL — route not registered.

- [ ] **Step 3: Implement `sidecar/routes/export.ts`**

```ts
import { QueryExecutor, BlacklistManager, BlacklistValidator } from '@carllee1983/dbcli/core'
import type { ConnectionPool } from '../connection-pool'
import { ExportBody } from '../../shared/schemas'
import { toErrorBody } from '../../shared/errors'
import { json } from '../http'

const DEFAULT_LIMIT = 10000 // exports allow more rows than the interactive grid
const CLIENT_ERROR_CODES = new Set(['PERMISSION', 'BLACKLISTED'])

/** Serialize rows to RFC-4180 CSV using an explicit column order. */
export function toCsv(columnNames: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columnNames.map(escape).join(',')
  const body = rows.map((row) => columnNames.map((c) => escape(row[c])).join(','))
  return [header, ...body].join('\n')
}

export function makeExportHandler(pool: ConnectionPool) {
  return async function exportRows(req: Request): Promise<Response> {
    const parsed = ExportBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId + sql + format required' } }, 400)

    const entry = pool.get(parsed.data.connectionId)
    if (!entry) return json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409)

    try {
      const validator = new BlacklistValidator(new BlacklistManager(entry.config))
      // Force query-only, same as /query — exports never write.
      const executor = new QueryExecutor(entry.adapter, 'query-only', validator, entry.config)
      const result = await executor.execute(parsed.data.sql, {
        autoLimit: true,
        limitValue: parsed.data.limit ?? DEFAULT_LIMIT,
      })

      if (parsed.data.format === 'json') {
        return new Response(JSON.stringify(result.rows), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-disposition': 'attachment; filename="export.json"',
          },
        })
      }
      const csv = toCsv(result.columnNames, result.rows)
      return new Response(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="export.csv"',
        },
      })
    } catch (err) {
      const body = toErrorBody(err)
      const status = CLIENT_ERROR_CODES.has(body.error.code) ? 403 : 500
      return json(body, status)
    }
  }
}
```

- [ ] **Step 4: Wire the route into `sidecar/server.ts`**

Add the import:

```ts
import { makeExportHandler } from './routes/export'
```

Register the route inside the `routes` object (after the schema routes):

```ts
      '/export': { POST: guard(deps.token, makeExportHandler(deps.pool)) },
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `bun test tests/sidecar/export-route.test.ts`
Expected: PASS (5 tests). CSV quoting, JSON body, NOT_OPEN, forced query-only rejection, and bad-format validation all proven through HTTP.

- [ ] **Step 6: Commit**

```bash
git add sidecar/routes/export.ts sidecar/server.ts tests/sidecar/export-route.test.ts
git commit -m "feat: [sidecar] /export CSV+JSON via forced query-only QueryExecutor"
```

---

## Task 6: Wire the real connection lister into the entry point

`/connections/list` currently returns 501 in production because `index.ts` does not pass a lister. Wire the disk-backed `defaultConnectionLister`.

**Files:**
- Modify: `sidecar/index.ts`

- [ ] **Step 1: Pass the lister**

In `sidecar/index.ts`, update the `connection-pool`/routes wiring. Change the import:

```ts
import { ConnectionPool, defaultPoolDeps } from './connection-pool'
import { defaultConnectionLister } from './routes/connections'
```

and the `createServer` call:

```ts
  const server = createServer({
    pool,
    token: cfg.token,
    port: cfg.port,
    listConnections: defaultConnectionLister(cfg.dbcliPath),
  })
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Smoke-run the entry**

Run: `DBCLI_GUI_WORKDIR=/tmp DBCLI_GUI_PORT=0 timeout 2 bun run sidecar/index.ts || true`
Expected: prints a JSON line like `{"ready":true,"port":<n>,"token":"..."}` then exits on the timeout. (It does not need a real `.dbcli` to boot — the lister only runs when `/connections/list` is called.)

- [ ] **Step 4: Full suite + commit**

Run: `bun test tests/sidecar/ && bunx tsc --noEmit`
Expected: all sidecar tests pass; typecheck exit 0.

```bash
git add sidecar/index.ts
git commit -m "feat: [sidecar] wire real v2 connection lister into entry point"
```

---

## Self-Review

- **Spec coverage (design §4.2):** `/connections/list` → Task 3 (+ Task 6 wiring); `/schema/tree` + `/schema/table` → Task 4; `/export` → Task 5; `/query` enriched to `{ rows, fields, rowCount, ms }` → Task 1; request schemas → Task 2. `/health`, `/connections/open|close`, `/query` core already shipped in the prior plan. Remaining design items (`api/client.ts`, views, Tauri shell) are explicitly out of scope.
- **Placeholder scan:** every step has concrete code + exact commands + expected output. No TBD / "add validation" / "similar to Task N".
- **Type/symbol consistency:** uses only verified `@carllee1983/dbcli/core` exports — `QueryExecutor`, `BlacklistManager` (`isTableBlacklisted`, `getBlacklistedColumns`), `BlacklistValidator`, `BlacklistError`, `readV2Config`, `listConnections`, and types `DatabaseAdapter` (`listTables`, `getTableSchema`), `TableSchema`, `DbcliConfig`. `QueryResult` fields `columnNames`/`executionTimeMs`/`rowCount` match Task 1's response. `json()` imported from `sidecar/http.ts` (not re-defined). `ConnectionLister`/`makeListHandler`/`defaultConnectionLister`/`makeSchemaHandlers`/`makeExportHandler`/`toCsv` names are consistent across the tasks that define and consume them. `ServerDeps.listConnections` is optional, keeping every existing `createServer({ pool, token, port })` test green.
- **Blacklist correctness:** tree hides blacklisted tables; `schema/table` rejects a blacklisted table *before* the DB call (no schema leak) and strips blacklisted columns from allowed tables; `/export` runs through the same `BlacklistValidator` + forced `query-only` as `/query`. Proven end-to-end in Tasks 4 and 5 with fake adapters.
- **Risk note:** `/connections/list` is v2-only (`readV2Config`); a v1-format `.dbcli` will surface as a 500 `INTERNAL` (Task 3's error test covers the throw path). v1 config support is deliberately deferred — the GUI is designed around v2 multi-connection projects. Export is non-streaming in v1; the `DEFAULT_LIMIT` of 10000 caps memory — if a larger export is ever needed, switch to a streaming `ReadableStream` body in v2 (noted, not silently capped).
```