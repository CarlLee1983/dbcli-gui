# dbcli-gui Bun Sidecar — Core Connect+Query Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first slice of the `dbcli-gui` Bun sidecar — a long-lived local HTTP server that imports `@carllee1983/dbcli/core`, opens/closes pooled SQL connections, and runs query-only SQL through dbcli's `QueryExecutor` (permission + blacklist enforced), returning rows as JSON.

**Architecture:** One Bun process. `createServer({ pool, token, port })` builds a `Bun.serve()` instance whose route handlers live in `sidecar/routes/*`. A `ConnectionPool` holds `connectionId → { adapter, config }`, built through two injectable seams (`loadConfig`, `openAdapter`) so tests run end-to-end with a fake adapter — no database, no `.dbcli` fixture. Auth is a startup-generated bearer token required on every route except `/health`. Request bodies validated with zod (pinned v3 to match the engine).

**Tech Stack:** Bun (`Bun.serve`, `bun test`), TypeScript, zod v3, `@carllee1983/dbcli/core`.

**Scope:** Core loop only — `/health`, bearer auth, `/connections/open`, `/connections/close`, `/query`. Deferred to the next plan: `/connections/list` (real `.dbcli` discovery), `/schema/tree` + `/schema/table`, `/export`. Then the React frontend, then the Tauri shell. Design: `docs/dbcli-gui-design.md`.

---

## File Structure

- `sidecar/config.ts` — **create**. Reads sidecar runtime config from env: `workdir` (default `process.cwd()`), `port` (default `0`), `token` (default generated). Exposes the resolved `.dbcli` path.
- `sidecar/auth.ts` — **create**. `generateToken()`, `checkBearer(req, token): boolean`, `withAuth(token, handler)` wrapper.
- `sidecar/connection-pool.ts` — **create**. `ConnectionPool` class with injectable `loadConfig` + `openAdapter`; `open/get/close/closeAll`.
- `sidecar/server.ts` — **create**. `createServer({ pool, token, port })` → Bun server; routes registry; JSON error envelope; `/health`.
- `sidecar/routes/connections.ts` — **create**. `openHandler`, `closeHandler` (use pool).
- `sidecar/routes/query.ts` — **create**. `queryHandler` (QueryExecutor, forced `query-only`, blacklist).
- `sidecar/index.ts` — **create** (entry). Wires real pool + config, starts server, prints `{port, token}` JSON to stdout.
- `shared/schemas.ts` — **create**. zod request schemas.
- `shared/errors.ts` — **create**. `toErrorBody(err)` mapping dbcli errors → `{ code, message }`.
- `tests/sidecar/*.test.ts` — **create** per task.

**Conventions:** `Bun.serve({ port, routes, fetch })`; handlers are `(req: Request) => Response | Promise<Response>`; POST bodies are JSON. No express. Keep files focused (<300 lines).

---

## Task 1: Sidecar runtime config + error envelope + zod schemas

**Files:**
- Create: `sidecar/config.ts`, `shared/errors.ts`, `shared/schemas.ts`
- Test: `tests/sidecar/foundation.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sidecar/foundation.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { resolveSidecarConfig } from '../../sidecar/config'
import { toErrorBody } from '../../shared/errors'
import { OpenBody, QueryBody } from '../../shared/schemas'
import { BlacklistError } from '@carllee1983/dbcli/core'

test('resolveSidecarConfig reads env with sane defaults', () => {
  const cfg = resolveSidecarConfig({ DBCLI_GUI_WORKDIR: '/tmp/proj', DBCLI_GUI_PORT: '0', DBCLI_GUI_TOKEN: 'tok' })
  expect(cfg.workdir).toBe('/tmp/proj')
  expect(cfg.dbcliPath).toBe('/tmp/proj/.dbcli')
  expect(cfg.port).toBe(0)
  expect(cfg.token).toBe('tok')
})

test('resolveSidecarConfig generates a token when none provided', () => {
  const cfg = resolveSidecarConfig({})
  expect(typeof cfg.token).toBe('string')
  expect(cfg.token.length).toBeGreaterThanOrEqual(16)
})

test('toErrorBody maps dbcli BlacklistError to a safe code', () => {
  const body = toErrorBody(new BlacklistError('users is protected'))
  expect(body.error.code).toBe('BLACKLISTED')
  expect(typeof body.error.message).toBe('string')
})

test('toErrorBody falls back to INTERNAL for unknown errors', () => {
  expect(toErrorBody(new Error('boom')).error.code).toBe('INTERNAL')
})

test('QueryBody rejects missing sql', () => {
  expect(QueryBody.safeParse({ connectionId: 'c' }).success).toBe(false)
  expect(QueryBody.safeParse({ connectionId: 'c', sql: 'SELECT 1' }).success).toBe(true)
})

test('OpenBody requires connectionId', () => {
  expect(OpenBody.safeParse({}).success).toBe(false)
  expect(OpenBody.safeParse({ connectionId: 'main' }).success).toBe(true)
})
```

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/foundation.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three modules**

`sidecar/config.ts`:

```ts
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export interface SidecarConfig {
  workdir: string
  dbcliPath: string
  port: number
  token: string
}

/** Resolve sidecar runtime config from an env-like record (defaults applied). */
export function resolveSidecarConfig(env: Record<string, string | undefined> = process.env): SidecarConfig {
  const workdir = env.DBCLI_GUI_WORKDIR ?? process.cwd()
  return {
    workdir,
    dbcliPath: join(workdir, '.dbcli'),
    port: env.DBCLI_GUI_PORT ? Number(env.DBCLI_GUI_PORT) : 0,
    token: env.DBCLI_GUI_TOKEN ?? randomBytes(24).toString('hex'),
  }
}
```

`shared/errors.ts`:

```ts
import { BlacklistError, ConnectionError } from '@carllee1983/dbcli/core'

export interface ErrorBody {
  error: { code: string; message: string }
}

/**
 * Map an error to a user-safe { code, message }. dbcli's typed errors get
 * semantic codes; everything else collapses to INTERNAL (details stay in logs).
 */
export function toErrorBody(err: unknown): ErrorBody {
  if (err instanceof BlacklistError) return { error: { code: 'BLACKLISTED', message: err.message } }
  if (err instanceof ConnectionError) return { error: { code: 'CONNECTION', message: err.message } }
  // PermissionError is not exported as a class; match by name (thrown by QueryExecutor).
  if (err instanceof Error && err.name === 'PermissionError') {
    return { error: { code: 'PERMISSION', message: err.message } }
  }
  if (err instanceof Error && err.message) return { error: { code: 'INTERNAL', message: err.message } }
  return { error: { code: 'INTERNAL', message: 'Unknown error' } }
}
```

`shared/schemas.ts`:

```ts
import { z } from 'zod'

export const OpenBody = z.object({ connectionId: z.string().min(1) })
export const CloseBody = z.object({ connectionId: z.string().min(1) })
export const QueryBody = z.object({
  connectionId: z.string().min(1),
  sql: z.string().min(1),
  limit: z.number().int().positive().optional(),
})

export type OpenBody = z.infer<typeof OpenBody>
export type CloseBody = z.infer<typeof CloseBody>
export type QueryBody = z.infer<typeof QueryBody>
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/sidecar/foundation.test.ts`
Expected: PASS (6 tests). NOTE: if `PermissionError` matching needs adjustment, leave the name-based check — it is verified end-to-end in Task 5.

- [ ] **Step 5: Commit**

```bash
git add sidecar/config.ts shared/errors.ts shared/schemas.ts tests/sidecar/foundation.test.ts
git commit -m "feat: [sidecar] runtime config + error envelope + request schemas"
```

---

## Task 2: Auth (bearer token)

**Files:**
- Create: `sidecar/auth.ts`
- Test: `tests/sidecar/auth.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sidecar/auth.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { generateToken, checkBearer } from '../../sidecar/auth'

function reqWith(auth?: string): Request {
  return new Request('http://localhost/x', auth ? { headers: { authorization: auth } } : {})
}

test('generateToken returns a long random hex string', () => {
  const a = generateToken()
  const b = generateToken()
  expect(a).not.toBe(b)
  expect(a.length).toBeGreaterThanOrEqual(32)
})

test('checkBearer accepts the exact token and rejects others', () => {
  expect(checkBearer(reqWith('Bearer secret'), 'secret')).toBe(true)
  expect(checkBearer(reqWith('Bearer wrong'), 'secret')).toBe(false)
  expect(checkBearer(reqWith(), 'secret')).toBe(false)
  expect(checkBearer(reqWith('secret'), 'secret')).toBe(false) // missing "Bearer " prefix
})
```

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/auth.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `sidecar/auth.ts`**

```ts
import { randomBytes } from 'node:crypto'

export function generateToken(): string {
  return randomBytes(24).toString('hex')
}

/** Constant-prefix bearer check. Returns true iff header is exactly `Bearer <token>`. */
export function checkBearer(req: Request, token: string): boolean {
  const header = req.headers.get('authorization')
  return header === `Bearer ${token}`
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/sidecar/auth.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add sidecar/auth.ts tests/sidecar/auth.test.ts
git commit -m "feat: [sidecar] bearer token auth"
```

---

## Task 3: Connection pool (injectable seams)

**Files:**
- Create: `sidecar/connection-pool.ts`
- Test: `tests/sidecar/connection-pool.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sidecar/connection-pool.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DatabaseAdapter, DbcliConfig } from '@carllee1983/dbcli/core'

function fakeAdapter(events: string[]): DatabaseAdapter {
  return {
    connect: async () => { events.push('connect') },
    disconnect: async () => { events.push('disconnect') },
    execute: async () => ({ rows: [] }),
  } as unknown as DatabaseAdapter
}

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig

test('open connects an adapter and get returns the entry', async () => {
  const events: string[] = []
  const pool = new ConnectionPool({
    loadConfig: async () => fakeConfig,
    openAdapter: () => fakeAdapter(events),
  })
  const entry = await pool.open('main')
  expect(entry.config).toBe(fakeConfig)
  expect(events).toContain('connect')
  expect(pool.get('main')).toBe(entry)
})

test('open is idempotent — second open reuses the same entry (no reconnect)', async () => {
  const events: string[] = []
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter(events) })
  const a = await pool.open('main')
  const b = await pool.open('main')
  expect(b).toBe(a)
  expect(events.filter((e) => e === 'connect').length).toBe(1)
})

test('close disconnects and removes the entry', async () => {
  const events: string[] = []
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter(events) })
  await pool.open('main')
  await pool.close('main')
  expect(events).toContain('disconnect')
  expect(pool.get('main')).toBeUndefined()
})

test('get throws-free for unknown id; close on unknown id is a no-op', async () => {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter([]) })
  expect(pool.get('nope')).toBeUndefined()
  await pool.close('nope') // must not throw
})
```

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/connection-pool.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `sidecar/connection-pool.ts`**

```ts
import {
  AdapterFactory,
  readConfig,
  type DatabaseAdapter,
  type DbcliConfig,
  type SqlConnectionOptions,
} from '@carllee1983/dbcli/core'

export interface PoolEntry {
  adapter: DatabaseAdapter
  config: DbcliConfig
}

export interface PoolDeps {
  /** Load a fully-resolved DbcliConfig for a connection id. Default: readConfig(dbcliPath, id). */
  loadConfig: (connectionId: string) => Promise<DbcliConfig>
  /** Build (not yet connected) an adapter from a config. Default: SQL adapter via AdapterFactory. */
  openAdapter: (config: DbcliConfig) => DatabaseAdapter
}

/** Build default deps bound to a project `.dbcli` path. */
export function defaultPoolDeps(dbcliPath: string): PoolDeps {
  return {
    loadConfig: (id) => readConfig(dbcliPath, id),
    // $env refs are already expanded by readConfig; narrow to SQL options like the CLI does.
    openAdapter: (config) => AdapterFactory.createSqlAdapter(config.connection as SqlConnectionOptions),
  }
}

/** Holds one connected adapter per connectionId. */
export class ConnectionPool {
  private readonly entries = new Map<string, PoolEntry>()
  constructor(private readonly deps: PoolDeps) {}

  async open(connectionId: string): Promise<PoolEntry> {
    const existing = this.entries.get(connectionId)
    if (existing) return existing
    const config = await this.deps.loadConfig(connectionId)
    const adapter = this.deps.openAdapter(config)
    await adapter.connect()
    const entry: PoolEntry = { adapter, config }
    this.entries.set(connectionId, entry)
    return entry
  }

  get(connectionId: string): PoolEntry | undefined {
    return this.entries.get(connectionId)
  }

  async close(connectionId: string): Promise<void> {
    const entry = this.entries.get(connectionId)
    if (!entry) return
    this.entries.delete(connectionId)
    await entry.adapter.disconnect()
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.close(id)))
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/sidecar/connection-pool.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add sidecar/connection-pool.ts tests/sidecar/connection-pool.test.ts
git commit -m "feat: [sidecar] connection pool with injectable config/adapter seams"
```

---

## Task 4: Server foundation + `/health`

**Files:**
- Create: `sidecar/server.ts`
- Test: `tests/sidecar/server.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sidecar/server.test.ts`:

```ts
import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig
const fakeAdapter = { connect: async () => {}, disconnect: async () => {}, execute: async () => ({ rows: [] }) } as unknown as DatabaseAdapter

function makeServer() {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter })
  return createServer({ pool, token: 'test', port: 0 })
}

let server: ReturnType<typeof makeServer> | undefined
afterEach(() => server?.stop(true))

test('GET /health returns ok without auth', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/health`)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(typeof body.version).toBe('string')
})

test('unknown route returns a JSON 404 envelope', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/nope`, { headers: { authorization: 'Bearer test' } })
  expect(res.status).toBe(404)
  expect((await res.json()).error.code).toBe('NOT_FOUND')
})
```

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/server.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `sidecar/server.ts` (health only for now)**

```ts
import type { Server } from 'bun'
import pkg from '../package.json'
import type { ConnectionPool } from './connection-pool'

export interface ServerDeps {
  pool: ConnectionPool
  token: string
  port: number
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Build (and start) the sidecar HTTP server. Route handlers are added in later tasks. */
export function createServer(deps: ServerDeps): Server {
  return Bun.serve({
    port: deps.port,
    routes: {
      '/health': () => json({ ok: true, version: pkg.version }),
    },
    fetch: () => json({ error: { code: 'NOT_FOUND', message: 'No such route' } }, 404),
  })
}
```

Note: `import pkg from '../package.json'` requires `resolveJsonModule` — Bun supports JSON imports by default; if `bunx tsc` complains, add `"resolveJsonModule": true` to `tsconfig.json` compilerOptions.

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun test tests/sidecar/server.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add sidecar/server.ts tests/sidecar/server.test.ts tsconfig.json
git commit -m "feat: [sidecar] Bun.serve foundation + /health + JSON 404"
```

---

## Task 5: Connection routes (`/connections/open`, `/connections/close`)

**Files:**
- Create: `sidecar/routes/connections.ts`
- Modify: `sidecar/server.ts` (wire routes + auth)
- Test: `tests/sidecar/connections-route.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sidecar/connections-route.test.ts`:

```ts
import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig
function fakeAdapter() { return { connect: async () => {}, disconnect: async () => {}, execute: async () => ({ rows: [] }) } as unknown as DatabaseAdapter }

let server: ReturnType<typeof createServer> | undefined
afterEach(() => server?.stop(true))

function start() {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter() })
  server = createServer({ pool, token: 'test', port: 0 })
  return server
}
const post = (s: ReturnType<typeof createServer>, path: string, body: unknown, auth = 'Bearer test') =>
  fetch(`http://localhost:${s.port}${path}`, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('POST /connections/open without auth returns 401', async () => {
  const s = start()
  const res = await post(s, '/connections/open', { connectionId: 'main' }, 'Bearer wrong')
  expect(res.status).toBe(401)
})

test('POST /connections/open opens and returns system', async () => {
  const s = start()
  const res = await post(s, '/connections/open', { connectionId: 'main' })
  expect(res.status).toBe(200)
  expect((await res.json()).ok).toBe(true)
})

test('POST /connections/open with invalid body returns 400', async () => {
  const s = start()
  const res = await post(s, '/connections/open', {})
  expect(res.status).toBe(400)
  expect((await res.json()).error.code).toBe('BAD_REQUEST')
})

test('POST /connections/close closes an open connection', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/connections/close', { connectionId: 'main' })
  expect(res.status).toBe(200)
})
```

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/connections-route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `sidecar/routes/connections.ts`**

```ts
import type { ConnectionPool } from '../connection-pool'
import { OpenBody, CloseBody } from '../../shared/schemas'
import { toErrorBody } from '../../shared/errors'
import { json } from '../server'

export function makeConnectionHandlers(pool: ConnectionPool) {
  return {
    async open(req: Request): Promise<Response> {
      const parsed = OpenBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId required' } }, 400)
      try {
        const entry = await pool.open(parsed.data.connectionId)
        return json({ ok: true, system: (entry.config.connection as { system?: string }).system })
      } catch (err) {
        return json(toErrorBody(err), 502)
      }
    },
    async close(req: Request): Promise<Response> {
      const parsed = CloseBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId required' } }, 400)
      await pool.close(parsed.data.connectionId)
      return json({ ok: true })
    },
  }
}
```

- [ ] **Step 4: Wire routes + auth into `sidecar/server.ts`**

Replace the `createServer` body so protected routes go through a bearer check. Update `sidecar/server.ts`:

```ts
import type { Server } from 'bun'
import pkg from '../package.json'
import type { ConnectionPool } from './connection-pool'
import { checkBearer } from './auth'
import { makeConnectionHandlers } from './routes/connections'

export interface ServerDeps {
  pool: ConnectionPool
  token: string
  port: number
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

type Handler = (req: Request) => Response | Promise<Response>
const guard = (token: string, h: Handler): Handler => (req) =>
  checkBearer(req, token) ? h(req) : json({ error: { code: 'UNAUTHORIZED', message: 'bad token' } }, 401)

export function createServer(deps: ServerDeps): Server {
  const conn = makeConnectionHandlers(deps.pool)
  return Bun.serve({
    port: deps.port,
    routes: {
      '/health': () => json({ ok: true, version: pkg.version }),
      '/connections/open': { POST: guard(deps.token, conn.open) },
      '/connections/close': { POST: guard(deps.token, conn.close) },
    },
    fetch: () => json({ error: { code: 'NOT_FOUND', message: 'No such route' } }, 404),
  })
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `bun test tests/sidecar/connections-route.test.ts tests/sidecar/server.test.ts`
Expected: PASS (server health + 404 still green; 4 connection tests green).

- [ ] **Step 6: Commit**

```bash
git add sidecar/routes/connections.ts sidecar/server.ts tests/sidecar/connections-route.test.ts
git commit -m "feat: [sidecar] /connections/open + /connections/close behind auth"
```

---

## Task 6: Query route (`/query`, forced query-only + blacklist)

**Files:**
- Create: `sidecar/routes/query.ts`
- Modify: `sidecar/server.ts` (wire `/query`)
- Test: `tests/sidecar/query-route.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sidecar/query-route.test.ts`:

```ts
import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

// Minimal config with no blacklist; permission in config is read-write but the route forces query-only.
const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig

function fakeAdapter(rows: Array<Record<string, unknown>>): DatabaseAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    // QueryExecutor calls adapter.execute(sql) for SELECTs; return canned rows.
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

test('SELECT returns rows from the adapter', async () => {
  const s = start([{ id: 1 }, { id: 2 }])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/query', { connectionId: 'main', sql: 'SELECT * FROM t' })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body.rows)).toBe(true)
  expect(body.rows.length).toBe(2)
})

test('query on an unopened connection returns 409', async () => {
  const s = start([])
  const res = await post(s, '/query', { connectionId: 'missing', sql: 'SELECT 1' })
  expect(res.status).toBe(409)
  expect((await res.json()).error.code).toBe('NOT_OPEN')
})

test('write statement is rejected by forced query-only permission', async () => {
  const s = start([])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/query', { connectionId: 'main', sql: 'DELETE FROM users' })
  expect(res.status).toBe(403)
  expect((await res.json()).error.code).toBe('PERMISSION')
})

test('invalid body returns 400', async () => {
  const s = start([])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/query', { connectionId: 'main' })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run it, confirm failure**

Run: `bun test tests/sidecar/query-route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `sidecar/routes/query.ts`**

```ts
import { QueryExecutor, BlacklistManager, BlacklistValidator } from '@carllee1983/dbcli/core'
import type { ConnectionPool } from '../connection-pool'
import { QueryBody } from '../../shared/schemas'
import { toErrorBody } from '../../shared/errors'
import { json } from '../server'

const DEFAULT_LIMIT = 1000

export function makeQueryHandler(pool: ConnectionPool) {
  return async function query(req: Request): Promise<Response> {
    const parsed = QueryBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId + sql required' } }, 400)

    const entry = pool.get(parsed.data.connectionId)
    if (!entry) return json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409)

    try {
      const validator = new BlacklistValidator(new BlacklistManager(entry.config))
      // v1: force query-only regardless of the connection's configured permission.
      const executor = new QueryExecutor(entry.adapter, 'query-only', validator, entry.config)
      const result = await executor.execute(parsed.data.sql, {
        autoLimit: true,
        limitValue: parsed.data.limit ?? DEFAULT_LIMIT,
      })
      return json({ rows: result.rows, rowCount: result.rows.length })
    } catch (err) {
      const body = toErrorBody(err)
      const status = body.error.code === 'PERMISSION' ? 403 : body.error.code === 'BLACKLISTED' ? 403 : 500
      return json(body, status)
    }
  }
}
```

- [ ] **Step 4: Wire `/query` into `sidecar/server.ts`**

Add the import and route to `createServer` in `sidecar/server.ts`:

```ts
import { makeQueryHandler } from './routes/query'
```

and inside the `routes` object (after the connections routes):

```ts
      '/query': { POST: guard(deps.token, makeQueryHandler(deps.pool)) },
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `bun test tests/sidecar/`
Expected: ALL sidecar tests pass (foundation + auth + pool + server + connections + query). The query-only rejection test proves the real `QueryExecutor` permission path runs end-to-end through HTTP with a fake adapter.

- [ ] **Step 6: typecheck + commit**

Run: `bunx tsc --noEmit` → exit 0.

```bash
git add sidecar/routes/query.ts sidecar/server.ts tests/sidecar/query-route.test.ts
git commit -m "feat: [sidecar] /query via QueryExecutor (forced query-only + blacklist)"
```

---

## Task 7: Entry point + run script

**Files:**
- Create: `sidecar/index.ts`
- Modify: `package.json` (add `scripts.sidecar`)

- [ ] **Step 1: Implement `sidecar/index.ts`**

```ts
import { resolveSidecarConfig } from './config'
import { ConnectionPool, defaultPoolDeps } from './connection-pool'
import { createServer } from './server'

const cfg = resolveSidecarConfig()
const pool = new ConnectionPool(defaultPoolDeps(cfg.dbcliPath))
const server = createServer({ pool, token: cfg.token, port: cfg.port })

// The Tauri shell (or a dev caller) reads this line to learn where to connect.
console.log(JSON.stringify({ ready: true, port: server.port, token: cfg.token }))

const shutdown = async () => {
  await pool.closeAll()
  server.stop(true)
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
```

- [ ] **Step 2: Add the run script to `package.json`**

Add to `scripts`:

```json
    "sidecar": "bun run sidecar/index.ts"
```

- [ ] **Step 3: Smoke-run the entry (manual verification)**

Run: `DBCLI_GUI_WORKDIR=/tmp DBCLI_GUI_PORT=0 timeout 2 bun run sidecar/index.ts || true`
Expected: prints a JSON line like `{"ready":true,"port":<n>,"token":"..."}`. (It will exit when the timeout fires — that's fine; we only verify it boots and announces.)

- [ ] **Step 4: Full suite + commit**

Run: `bun test tests/sidecar/ && bunx tsc --noEmit`
Expected: all pass, exit 0.

```bash
git add sidecar/index.ts package.json
git commit -m "feat: [sidecar] entry point that boots the server and announces port+token"
```

---

## Self-Review

- **Scope coverage:** delivers the design's sidecar core loop (§4 modules `server`/`connection-pool`/`auth`/`routes`, §4.2 API subset `/health`/`/connections/open`/`/connections/close`/`/query`, §4.3 forced query-only). `/connections/list`, `/schema/*`, `/export` are explicitly deferred to the next plan.
- **Placeholder scan:** every step has concrete code + commands + expected output. No TBD.
- **Type/symbol consistency:** uses only verified `@carllee1983/dbcli/core` exports — `readConfig`, `AdapterFactory.createSqlAdapter`, `QueryExecutor(adapter, permission, validator, config)`, `BlacklistManager`/`BlacklistValidator`, types `DbcliConfig`/`DatabaseAdapter`/`SqlConnectionOptions`. `json()` is defined once in `server.ts` and imported by route modules. `createServer` returns Bun's `Server` (has `.port` + `.stop()`).
- **Testability:** the pool's `loadConfig`/`openAdapter` seams let every HTTP test run with a fake adapter — no database, no `.dbcli` fixture — while still exercising the real `QueryExecutor` permission/blacklist path (the query-only rejection test is the proof).
- **Risk note:** `toErrorBody` matches `PermissionError` by `err.name` (the class is not exported from `./core`). Task 6's write-rejection test verifies this mapping end-to-end; if the thrown error's name differs, fix the match in `shared/errors.ts` and re-run.
