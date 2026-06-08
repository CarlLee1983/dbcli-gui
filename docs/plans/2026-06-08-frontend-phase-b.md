# Frontend Phase B — v1 Query Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser frontend for dbcli-gui's "lightweight query workbench" (pick connection → browse schema → write SQL → see result grid → export), talking to the existing Phase A Bun sidecar over localhost HTTP with a bearer token, plus a dev harness that spawns the sidecar and injects port/token.

**Architecture:** A React 19 SPA built and served by Bun's bundler (HTML imports, no Vite). A thin `api/client` does HTTP + type mapping; a single `useSidecar` hook owns all app state and is the only thing that touches the client; four views (Sidebar/Editor/ResultGrid/ExportButton) take data via props/hook and are independently testable. A `dev/serve.ts` harness spawns the sidecar child process, reads its `{ ready, port, token }` line, and serves the SPA with the port/token in the URL query string — exactly how the Phase C Tauri shell will inject them. The sidecar gains permissive CORS headers (safe because auth is bearer-token, not cookie-based).

**Tech Stack:** Bun (runtime, bundler, test runner), React 19 + react-dom 19, Tailwind CSS v4 via `bun-plugin-tailwind`, lucide-react (icons), zod (already used by shared schemas), `@testing-library/react` + `@testing-library/dom` + `@happy-dom/global-registrator` for tests.

---

## Pre-flight: facts this plan is built on (already verified)

- **Sidecar response shapes** (from `sidecar/routes/*.ts`):
  - `GET /health` → `{ ok: true, version: string }` (no auth)
  - `POST /connections/list` → `{ connections: { name, system, isDefault }[] }`
  - `POST /connections/open` → `{ ok: true, system: string }`
  - `POST /connections/close` → `{ ok: true }`
  - `POST /query` → `{ rows, fields, rowCount, ms }` where `fields = result.columnNames`, `ms = result.executionTimeMs ?? null`
  - `POST /schema/tree` → `{ tables: { name, type, columnCount?, rowCount? }[] }` (`type` is `tableType ?? 'table'`, blacklisted tables already removed)
  - `POST /schema/table` → `{ table: TableSchema }` (blacklisted columns already stripped)
  - `POST /export` → CSV (`text/csv`) or JSON (`application/json`) body with `content-disposition: attachment; filename="export.<ext>"`
  - All error bodies: `{ error: { code, message } }`. Codes seen: `UNAUTHORIZED`(401), `BAD_REQUEST`(400), `NOT_OPEN`(409), `BLACKLISTED`/`PERMISSION`(403), `CONNECTION`(502), `NOT_CONFIGURED`(501), `NOT_FOUND`(404), `INTERNAL`(500).
- **Request bodies** are defined in `shared/schemas.ts` (`OpenBody`, `CloseBody`, `QueryBody`, `SchemaTreeBody`, `SchemaTableBody`, `ExportBody`). The frontend sends matching JSON (`connectionId`, `sql`, `limit`, `table`, `format`).
- **dbcli core types** (`node_modules/@carllee1983/dbcli/dist/core.d.ts`): `ColumnSchema { name; type; nullable; default?; primaryKey?; ... }`, `TableSchema { name; columns; primaryKey?; indexes?; ... }`. Our DTOs are a subset of these.
- **Auth:** `Authorization: Bearer <token>` exactly (`sidecar/auth.ts`). `/health` needs no auth.
- **Bun + Tailwind v4 wiring (verified via context7):** install `tailwindcss@4` + `bun-plugin-tailwind`; register the plugin in `bunfig.toml` under `[serve.static]` for dev serving and pass it in the `plugins: [...]` array of a programmatic `Bun.build` for prod. CSS entry is `@import "tailwindcss";`. Tailwind v4 is config-less (no `tailwind.config.js`).
- **Existing test conventions** (`tests/sidecar/*.test.ts`): `import { test, expect } from 'bun:test'`, real `Bun.serve` on `port: 0`, fake config/adapter cast via `as unknown as`.
- **Plan location convention:** the project keeps plans in `docs/plans/` (two sidecar plans already there). Frontend tests go under `tests/frontend/`.

---

## File Structure

**New runtime files:**
- `sidecar/cors.ts` — CORS header constant + `withCors` wrapper + preflight response (Task 1)
- `dev/serve.ts` — dev harness: spawn sidecar, read ready line, serve SPA with injected URL (Task 2)
- `dev/ready-line.ts` — `readReadyLine(stream)` pure-ish reader, extracted for testability (Task 2)
- `build.ts` — prod build via `Bun.build` with the tailwind plugin (Task 3)
- `bunfig.toml` — `[serve.static]` plugins + `[test] preload` (Task 3)
- `src/index.html`, `src/main.tsx`, `src/index.css` — SPA entry (Task 3)
- `src/api/types.ts` — response DTO types (Task 4)
- `src/api/client.ts` — `ApiError`, `readConnParams`, `makeClient`, default `client`, `triggerDownload` (Task 4)
- `src/hooks/useSidecar.ts` — app state + actions hook (Task 5)
- `src/App.tsx` — 3-pane layout + offline page (Task 6)
- `src/components/ErrorBanner.tsx`, `src/components/Spinner.tsx` (Task 6)
- `src/views/Sidebar.tsx` (Task 7)
- `src/views/Editor.tsx` (Task 8)
- `src/views/ResultGrid.tsx` + `src/views/grid-virtual.ts` (pure helpers) (Task 9)
- `src/views/ExportButton.tsx` (Task 10)

**New test files:**
- `tests/sidecar/cors.test.ts` (Task 1)
- `tests/dev/ready-line.test.ts` (Task 2)
- `tests/frontend/client.test.ts` (Task 4)
- `tests/frontend/useSidecar.test.ts` (Task 5)
- `tests/frontend/Sidebar.test.tsx` (Task 7)
- `tests/frontend/Editor.test.tsx` (Task 8)
- `tests/frontend/grid-virtual.test.ts` + `tests/frontend/ResultGrid.test.tsx` (Task 9)
- `tests/frontend/ExportButton.test.tsx` (Task 10)
- `tests/frontend/ErrorBanner.test.tsx` (Task 6)
- `tests/frontend/happydom.ts` — preload that registers DOM globals (Task 3)

**Modified files:**
- `sidecar/server.ts` — apply `withCors` + OPTIONS routes (Task 1)
- `package.json` — promote deps, add devDeps, add `dev`/`build`/`test` scripts (Task 3)

---

## Task 1: Sidecar CORS enabler

**Files:**
- Create: `sidecar/cors.ts`
- Modify: `sidecar/server.ts`
- Test: `tests/sidecar/cors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/sidecar/cors.test.ts`:

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
afterEach(async () => { await server?.stop(true) })

test('OPTIONS preflight returns 204 with CORS headers and no token needed', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/query`, { method: 'OPTIONS' })
  expect(res.status).toBe(204)
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
  expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  expect(res.headers.get('access-control-allow-headers')).toContain('authorization')
})

test('normal responses carry Access-Control-Allow-Origin', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/health`)
  expect(res.status).toBe(200)
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
})

test('401 from a guarded route still carries CORS header', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  expect(res.status).toBe(401)
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/sidecar/cors.test.ts`
Expected: FAIL — `access-control-allow-origin` is `null` (header not set yet); the OPTIONS test likely gets a 404/405 instead of 204.

- [ ] **Step 3: Create the CORS helper**

Create `sidecar/cors.ts`:

```ts
/** Permissive CORS for the localhost dev/Tauri webview.
 * Safe: auth is bearer-token (not cookies), so `*` origin leaks nothing without a token.
 * We deliberately do NOT set Access-Control-Allow-Credentials. */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

type Handler = (req: Request) => Response | Promise<Response>

/** Wrap a handler so every response (including errors) carries CORS headers. */
export function withCors(handler: Handler): Handler {
  return async (req) => {
    const res = await handler(req)
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v)
    return res
  }
}

/** 204 response for OPTIONS preflight (runs before bearer auth — preflight carries no token). */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
```

- [ ] **Step 4: Wire it into the server**

Modify `sidecar/server.ts`. Add the import and apply `withCors` to every handler + the `fetch` fallback, and add an `OPTIONS` entry to each route. Replace the `import { json } ...` line region and the `Bun.serve({...})` block:

```ts
import { json } from './http'
import { withCors, corsPreflight } from './cors'
```

Then change `createServer` body to:

```ts
export function createServer(deps: ServerDeps): Server<unknown> {
  const conn = makeConnectionHandlers(deps.pool)
  const schema = makeSchemaHandlers(deps.pool)
  const post = (h: Handler) => ({ POST: withCors(guard(deps.token, h)), OPTIONS: corsPreflight })
  return Bun.serve({
    port: deps.port,
    routes: {
      '/health': { GET: withCors(() => json({ ok: true, version: pkg.version })), OPTIONS: corsPreflight },
      '/connections/open': post(conn.open),
      '/connections/close': post(conn.close),
      '/connections/list': post(makeListHandler(deps.listConnections)),
      '/query': post(makeQueryHandler(deps.pool)),
      '/schema/tree': post(schema.tree),
      '/schema/table': post(schema.table),
      '/export': post(makeExportHandler(deps.pool)),
    },
    fetch: withCors(() => json({ error: { code: 'NOT_FOUND', message: 'No such route' } }, 404)),
  })
}
```

(Note: `Handler` type is already declared in `server.ts` at line 19. `guard` is already declared. No other changes.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/sidecar/cors.test.ts && bun test tests/sidecar/server.test.ts`
Expected: PASS for all (cors tests pass; the pre-existing server tests still pass since `/health` and 404 behavior are unchanged apart from extra headers).

- [ ] **Step 6: Run the full sidecar suite to confirm no regressions**

Run: `bun test tests/sidecar`
Expected: PASS — all existing route tests unaffected.

- [ ] **Step 7: Commit**

```bash
git add sidecar/cors.ts sidecar/server.ts tests/sidecar/cors.test.ts
git commit -m "feat: [sidecar] CORS headers + OPTIONS preflight for browser frontend"
```

---

## Task 2: Dev harness (`dev/serve.ts` + `dev/ready-line.ts`)

**Files:**
- Create: `dev/ready-line.ts`
- Create: `dev/serve.ts`
- Test: `tests/dev/ready-line.test.ts`

The harness orchestrates a child process and a server — that I/O is verified by the Step-9 manual smoke. The parseable part (reading the first JSON line off a stream) is extracted into `readReadyLine` and unit-tested.

- [ ] **Step 1: Write the failing test for the ready-line reader**

Create `tests/dev/ready-line.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { readReadyLine } from '../../dev/ready-line'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

test('parses the first JSON line and ignores later output', async () => {
  const stream = streamOf(['{"ready":true,"port":12345,"token":"abc"}\n', 'later log line\n'])
  const ready = await readReadyLine(stream)
  expect(ready).toEqual({ ready: true, port: 12345, token: 'abc' })
})

test('handles a JSON line split across chunks', async () => {
  const stream = streamOf(['{"ready":true,', '"port":7,"token":"z"}\n'])
  const ready = await readReadyLine(stream)
  expect(ready.port).toBe(7)
  expect(ready.token).toBe('z')
})

test('throws if the stream ends before a newline', async () => {
  const stream = streamOf(['{"ready":true'])
  await expect(readReadyLine(stream)).rejects.toThrow(/before ready/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/dev/ready-line.test.ts`
Expected: FAIL — `Cannot find module '../../dev/ready-line'`.

- [ ] **Step 3: Implement `readReadyLine`**

Create `dev/ready-line.ts`:

```ts
export interface SidecarReady {
  ready: boolean
  port: number
  token: string
}

/** Read the first newline-terminated JSON line from a process stdout stream. */
export async function readReadyLine(stream: ReadableStream<Uint8Array>): Promise<SidecarReady> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) throw new Error('sidecar exited before ready line')
      buffer += decoder.decode(value, { stream: true })
      const nl = buffer.indexOf('\n')
      if (nl >= 0) return JSON.parse(buffer.slice(0, nl)) as SidecarReady
    }
  } finally {
    reader.releaseLock()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/dev/ready-line.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Implement the dev harness**

Create `dev/serve.ts`:

```ts
import index from '../src/index.html'
import { readReadyLine } from './ready-line'

const DEV_PORT = Number(process.env.DBCLI_GUI_DEV_PORT ?? 3000)

// Spawn the sidecar child process. It prints {ready,port,token} as its first stdout line.
const sidecar = Bun.spawn(['bun', 'run', 'sidecar/index.ts'], {
  stdout: 'pipe',
  stderr: 'inherit',
  env: { ...process.env },
})

const ready = await readReadyLine(sidecar.stdout)

const server = Bun.serve({
  port: DEV_PORT,
  development: { hmr: true, console: true },
  routes: { '/': index },
})

const url = `http://localhost:${server.port}/?port=${ready.port}&token=${ready.token}`
console.log(`\n  dbcli-gui dev server:\n  ${url}\n`)

const shutdown = () => {
  try {
    sidecar.kill()
  } finally {
    process.exit(0)
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
// If the sidecar dies on its own, take the dev server down too.
sidecar.exited.then(() => {
  console.error('sidecar exited; shutting down dev server')
  shutdown()
})
```

(Note: `import index from '../src/index.html'` and the `routes`/`development` wiring depend on Task 3's `src/index.html` and `bunfig.toml`. This file will not run until Task 3 lands; that is expected — its only unit-tested piece, `readReadyLine`, is already green.)

- [ ] **Step 6: Commit**

```bash
git add dev/ready-line.ts dev/serve.ts tests/dev/ready-line.test.ts
git commit -m "feat: [dev] sidecar-spawning dev harness + ready-line reader"
```

---

## Task 3: Build skeleton — deps, bunfig, HTML/CSS entry, test preload

**Files:**
- Modify: `package.json`
- Create: `bunfig.toml`
- Create: `src/index.html`
- Create: `src/main.tsx`
- Create: `src/index.css`
- Create: `build.ts`
- Create: `tests/frontend/happydom.ts`

- [ ] **Step 1: Install/promote dependencies**

Run:

```bash
bun add react@19 react-dom@19 lucide-react
bun add --dev tailwindcss@4 bun-plugin-tailwind @testing-library/react @testing-library/dom @happy-dom/global-registrator @types/react @types/react-dom
```

Expected: `package.json` gains `react`, `react-dom`, `lucide-react` under `dependencies` and the rest under `devDependencies`; `bun install` completes without error.

- [ ] **Step 2: Add scripts to `package.json`**

Edit the `"scripts"` block in `package.json` to:

```json
  "scripts": {
    "sidecar": "bun run sidecar/index.ts",
    "dev": "bun run dev/serve.ts",
    "build": "bun run build.ts",
    "test": "bun test"
  },
```

- [ ] **Step 3: Create `bunfig.toml`**

Create `bunfig.toml`:

```toml
[serve.static]
plugins = ["bun-plugin-tailwind"]

[test]
preload = ["./tests/frontend/happydom.ts"]
```

- [ ] **Step 4: Create the happy-dom preload**

Create `tests/frontend/happydom.ts`:

```ts
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register({ url: 'http://localhost:3000/?port=9999&token=test-token' })
```

(The `url` seeds `location.search` so `readConnParams()` has values to read in tests.)

- [ ] **Step 5: Create the SPA entry files**

Create `src/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>dbcli</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

Create `src/index.css`:

```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
}

html,
body,
#root {
  height: 100%;
}

body {
  font-family: var(--font-sans);
  margin: 0;
}
```

Create `src/main.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')
createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

(Note: `./App` is created in Task 6. `bun build`/`bun run dev` won't succeed until then; that's expected.)

- [ ] **Step 6: Create the prod build script**

Create `build.ts`:

```ts
import tailwind from 'bun-plugin-tailwind'

const result = await Bun.build({
  entrypoints: ['./src/index.html'],
  outdir: './dist',
  target: 'browser',
  minify: true,
  plugins: [tailwind],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
console.log(`built ${result.outputs.length} files to ./dist`)
```

- [ ] **Step 7: Verify the test runner boots with the DOM preload**

Create a throwaway check by running the existing suite (preload must not break sidecar tests):

Run: `bun test tests/sidecar/server.test.ts`
Expected: PASS — happy-dom registers globals but sidecar tests still work.

- [ ] **Step 8: Verify TypeScript is happy with the new entry (ignoring not-yet-created App)**

Run: `bunx tsc --noEmit`
Expected: the ONLY errors are `Cannot find module './App'` (main.tsx) and `'../src/index.html'` / `./App` references — these resolve in Task 6. No other type errors. (If `tsc` reports JSX/react-dom typing errors, confirm `@types/react`/`@types/react-dom` installed in Step 1.)

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock bunfig.toml build.ts src/index.html src/index.css src/main.tsx tests/frontend/happydom.ts
git commit -m "chore: [frontend] Bun + Tailwind v4 build skeleton + test DOM preload"
```

---

## Task 4: `api/types.ts` + `api/client.ts`

**Files:**
- Create: `src/api/types.ts`
- Create: `src/api/client.ts`
- Test: `tests/frontend/client.test.ts`

- [ ] **Step 1: Create the DTO types**

Create `src/api/types.ts`:

```ts
export interface ConnectionSummary {
  name: string
  system: string
  isDefault: boolean
}

export interface QueryResultDto {
  rows: Array<Record<string, unknown>>
  fields: string[]
  rowCount: number
  ms: number | null
}

export interface TreeTable {
  name: string
  type: string
  columnCount?: number
  rowCount?: number | null
}

export interface TableColumnDto {
  name: string
  type: string
  nullable: boolean
  primaryKey?: boolean
  default?: string
}

export interface TableSchemaDto {
  name: string
  columns: TableColumnDto[]
  primaryKey?: string[]
  indexes?: Array<{ name: string; columns: string[]; unique: boolean }>
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/frontend/client.test.ts`:

```ts
import { test, expect, afterEach } from 'bun:test'
import { makeClient, ApiError, readConnParams } from '../../src/api/client'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

interface Recorded { url: string; init: RequestInit | undefined }

function stubFetch(handler: (rec: Recorded) => Response): Recorded[] {
  const calls: Recorded[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rec = { url: String(input), init }
    calls.push(rec)
    return handler(rec)
  }) as typeof fetch
  return calls
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('readConnParams reads port and token from a query string', () => {
  expect(readConnParams('?port=1234&token=abc')).toEqual({ port: '1234', token: 'abc' })
})

test('query() POSTs to the right URL with bearer token and parses the body', async () => {
  const calls = stubFetch(() => jsonRes({ rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 5 }))
  const client = makeClient('http://127.0.0.1:1234', 'tok')
  const result = await client.query('conn', 'SELECT 1', 100)
  expect(result.rows).toEqual([{ id: 1 }])
  expect(calls[0]!.url).toBe('http://127.0.0.1:1234/query')
  const init = calls[0]!.init!
  expect(init.method).toBe('POST')
  expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok')
  expect(JSON.parse(init.body as string)).toEqual({ connectionId: 'conn', sql: 'SELECT 1', limit: 100 })
})

test('health() does not require parsing an error and returns body', async () => {
  stubFetch(() => jsonRes({ ok: true, version: '0.1.0' }))
  const client = makeClient('http://127.0.0.1:1234', 'tok')
  expect(await client.health()).toEqual({ ok: true, version: '0.1.0' })
})

test('schemaTable() unwraps the { table } envelope', async () => {
  stubFetch(() => jsonRes({ table: { name: 't', columns: [{ name: 'id', type: 'int', nullable: false }] } }))
  const client = makeClient('http://127.0.0.1:1234', 'tok')
  const table = await client.schemaTable('conn', 't')
  expect(table.name).toBe('t')
  expect(table.columns[0]!.name).toBe('id')
})

test('non-2xx throws ApiError carrying code, message, status', async () => {
  stubFetch(() => jsonRes({ error: { code: 'BLACKLISTED', message: 'protected' } }, 403))
  const client = makeClient('http://127.0.0.1:1234', 'tok')
  try {
    await client.query('conn', 'SELECT * FROM secrets')
    throw new Error('should have thrown')
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError)
    const e = err as ApiError
    expect(e.code).toBe('BLACKLISTED')
    expect(e.message).toBe('protected')
    expect(e.status).toBe(403)
  }
})

test('exportRows() triggers a download with the content-disposition filename', async () => {
  stubFetch(() =>
    new Response('a,b\n1,2', {
      status: 200,
      headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="export.csv"' },
    }),
  )
  // happy-dom lacks createObjectURL; stub it and capture the anchor click.
  const origCreate = (URL as unknown as { createObjectURL?: unknown }).createObjectURL
  const origRevoke = (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
  ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake'
  ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}
  const clicked: string[] = []
  const origClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicked.push(this.download) }
  try {
    const client = makeClient('http://127.0.0.1:1234', 'tok')
    await client.exportRows('conn', 'SELECT 1', 'csv')
    expect(clicked).toEqual(['export.csv'])
  } finally {
    HTMLAnchorElement.prototype.click = origClick
    ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = origCreate
    ;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = origRevoke
  }
})
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `bun test tests/frontend/client.test.ts`
Expected: FAIL — `Cannot find module '../../src/api/client'`.

- [ ] **Step 3: Implement the client**

Create `src/api/client.ts`:

```ts
import type {
  ConnectionSummary,
  QueryResultDto,
  TreeTable,
  TableSchemaDto,
} from './types'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Read port + token injected via the URL query string (dev harness or Tauri shell). */
export function readConnParams(search: string = location.search): { port: string; token: string } {
  const params = new URLSearchParams(search)
  return { port: params.get('port') ?? '', token: params.get('token') ?? '' }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string }
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const match = /filename="?([^"]+)"?/.exec(header)
  return match?.[1] ?? fallback
}

/** Build a download via a transient <a download> anchor. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface DbClient {
  health(): Promise<{ ok: boolean; version: string }>
  listConnections(): Promise<{ connections: ConnectionSummary[] }>
  openConnection(id: string): Promise<{ ok: boolean; system: string }>
  closeConnection(id: string): Promise<{ ok: boolean }>
  query(id: string, sql: string, limit?: number): Promise<QueryResultDto>
  schemaTree(id: string): Promise<{ tables: TreeTable[] }>
  schemaTable(id: string, table: string): Promise<TableSchemaDto>
  exportRows(id: string, sql: string, format: 'csv' | 'json'): Promise<void>
}

export function makeClient(base: string, token: string): DbClient {
  const auth = { Authorization: `Bearer ${token}` }

  async function parseOrThrow(res: Response): Promise<unknown> {
    if (res.ok) return res.json()
    let code = 'INTERNAL'
    let message = res.statusText || 'request failed'
    try {
      const body = (await res.json()) as ErrorEnvelope
      if (body.error?.code) code = body.error.code
      if (body.error?.message) message = body.error.message
    } catch {
      // non-JSON error body; keep defaults
    }
    throw new ApiError(code, message, res.status)
  }

  function get(path: string): Promise<unknown> {
    return fetch(`${base}${path}`, { headers: { ...auth } }).then(parseOrThrow)
  }

  function post(path: string, body: unknown): Promise<unknown> {
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(parseOrThrow)
  }

  return {
    health: () => get('/health') as Promise<{ ok: boolean; version: string }>,
    listConnections: () => post('/connections/list', {}) as Promise<{ connections: ConnectionSummary[] }>,
    openConnection: (id) => post('/connections/open', { connectionId: id }) as Promise<{ ok: boolean; system: string }>,
    closeConnection: (id) => post('/connections/close', { connectionId: id }) as Promise<{ ok: boolean }>,
    query: (id, sql, limit) =>
      post('/query', { connectionId: id, sql, ...(limit !== undefined ? { limit } : {}) }) as Promise<QueryResultDto>,
    schemaTree: (id) => post('/schema/tree', { connectionId: id }) as Promise<{ tables: TreeTable[] }>,
    schemaTable: async (id, table) => {
      const body = (await post('/schema/table', { connectionId: id, table })) as { table: TableSchemaDto }
      return body.table
    },
    exportRows: async (id, sql, format) => {
      const res = await fetch(`${base}/export`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId: id, sql, format }),
      })
      if (!res.ok) {
        await parseOrThrow(res)
        return
      }
      const blob = await res.blob()
      const filename = filenameFromDisposition(res.headers.get('content-disposition'), `export.${format}`)
      triggerDownload(blob, filename)
    },
  }
}

/** Default singleton built from the injected URL params. */
const { port, token } = readConnParams()
export const client: DbClient = makeClient(`http://127.0.0.1:${port}`, token)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/frontend/client.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/api/client.ts tests/frontend/client.test.ts
git commit -m "feat: [frontend] api client + DTO types with token + download handling"
```

---

## Task 5: `useSidecar` hook

**Files:**
- Create: `src/hooks/useSidecar.ts`
- Test: `tests/frontend/useSidecar.test.ts`

The hook owns all state and is the only consumer of the client. It takes the client as an argument (default = the singleton) so tests inject a fake.

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/useSidecar.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSidecar } from '../../src/hooks/useSidecar'
import type { DbClient } from '../../src/api/client'
import { ApiError } from '../../src/api/client'

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    health: async () => ({ ok: true, version: '0.1.0' }),
    listConnections: async () => ({ connections: [{ name: 'a', system: 'postgresql', isDefault: true }] }),
    openConnection: async () => ({ ok: true, system: 'postgresql' }),
    closeConnection: async () => ({ ok: true }),
    query: async () => ({ rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 3 }),
    schemaTree: async () => ({ tables: [{ name: 't', type: 'table' }] }),
    schemaTable: async () => ({ name: 't', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }] }),
    exportRows: async () => {},
    ...over,
  }
}

test('on mount it checks health and loads connections', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await waitFor(() => expect(result.current.connections.length).toBe(1))
})

test('health failure marks offline', async () => {
  const client = fakeClient({ health: async () => { throw new Error('down') } })
  const { result } = renderHook(() => useSidecar(client))
  await waitFor(() => expect(result.current.online).toBe(false))
})

test('selectConnection opens it and loads the schema tree', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  expect(result.current.activeConnectionId).toBe('a')
  expect(result.current.tree.length).toBe(1)
})

test('insertSelect sets a SELECT statement into sql', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  act(() => result.current.insertSelect('users'))
  expect(result.current.sql).toBe('SELECT * FROM users LIMIT 100')
})

test('runQuery stores the result', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  act(() => result.current.setSql('SELECT 1'))
  await act(async () => { await result.current.runQuery() })
  expect(result.current.result?.rowCount).toBe(1)
})

test('runQuery retries once after NOT_OPEN by reopening the connection', async () => {
  let queryCalls = 0
  let openCalls = 0
  const client = fakeClient({
    openConnection: async () => { openCalls++; return { ok: true, system: 'postgresql' } },
    query: async () => {
      queryCalls++
      if (queryCalls === 1) throw new ApiError('NOT_OPEN', 'connection not open', 409)
      return { rows: [], fields: [], rowCount: 0, ms: 1 }
    },
  })
  const { result } = renderHook(() => useSidecar(client))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  const openBefore = openCalls
  act(() => result.current.setSql('SELECT 1'))
  await act(async () => { await result.current.runQuery() })
  expect(queryCalls).toBe(2)
  expect(openCalls).toBe(openBefore + 1)
  expect(result.current.error).toBeNull()
})

test('runQuery surfaces a non-retryable ApiError', async () => {
  const client = fakeClient({
    query: async () => { throw new ApiError('PERMISSION', 'read-only', 403) },
  })
  const { result } = renderHook(() => useSidecar(client))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  act(() => result.current.setSql('DELETE FROM t'))
  await act(async () => { await result.current.runQuery() })
  expect(result.current.error?.code).toBe('PERMISSION')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/useSidecar.test.ts`
Expected: FAIL — `Cannot find module '../../src/hooks/useSidecar'`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useSidecar.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { client as defaultClient, ApiError, type DbClient } from '../api/client'
import type { ConnectionSummary, QueryResultDto, TreeTable, TableColumnDto } from '../api/types'

export interface SidecarState {
  online: boolean
  connections: ConnectionSummary[]
  activeConnectionId: string | null
  tree: TreeTable[]
  expandedColumns: Record<string, TableColumnDto[]>
  sql: string
  result: QueryResultDto | null
  error: ApiError | null
  loading: boolean
}

export interface SidecarApi extends SidecarState {
  refreshConnections(): Promise<void>
  selectConnection(id: string): Promise<void>
  loadTableColumns(table: string): Promise<void>
  setSql(sql: string): void
  runQuery(): Promise<void>
  insertSelect(table: string): void
  exportResult(format: 'csv' | 'json'): Promise<void>
  dismissError(): void
}

const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError('INTERNAL', err instanceof Error ? err.message : 'Unknown error', 0)

export function useSidecar(client: DbClient = defaultClient): SidecarApi {
  const [online, setOnline] = useState(false)
  const [connections, setConnections] = useState<ConnectionSummary[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeTable[]>([])
  const [expandedColumns, setExpandedColumns] = useState<Record<string, TableColumnDto[]>>({})
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<QueryResultDto | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)

  const refreshConnections = useCallback(async () => {
    const { connections } = await client.listConnections()
    setConnections(connections)
  }, [client])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await client.health()
        if (cancelled) return
        setOnline(true)
        await refreshConnections()
      } catch {
        if (!cancelled) setOnline(false)
      }
    })()
    return () => { cancelled = true }
  }, [client, refreshConnections])

  const selectConnection = useCallback(async (id: string) => {
    setError(null)
    try {
      await client.openConnection(id)
      setActiveConnectionId(id)
      setExpandedColumns({})
      const { tables } = await client.schemaTree(id)
      setTree(tables)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [client])

  const loadTableColumns = useCallback(async (table: string) => {
    if (!activeConnectionId) return
    try {
      const schema = await client.schemaTable(activeConnectionId, table)
      setExpandedColumns((prev) => ({ ...prev, [table]: schema.columns }))
    } catch (err) {
      setError(toApiError(err))
    }
  }, [client, activeConnectionId])

  const runQuery = useCallback(async () => {
    if (!activeConnectionId || sql.trim() === '') return
    setLoading(true)
    setError(null)
    try {
      let res: QueryResultDto
      try {
        res = await client.query(activeConnectionId, sql)
      } catch (err) {
        // One automatic reopen-and-retry when the connection dropped.
        if (err instanceof ApiError && err.code === 'NOT_OPEN') {
          await client.openConnection(activeConnectionId)
          res = await client.query(activeConnectionId, sql)
        } else {
          throw err
        }
      }
      setResult(res)
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setLoading(false)
    }
  }, [client, activeConnectionId, sql])

  const insertSelect = useCallback((table: string) => {
    setSql(`SELECT * FROM ${table} LIMIT 100`)
  }, [])

  const exportResult = useCallback(async (format: 'csv' | 'json') => {
    if (!activeConnectionId || sql.trim() === '') return
    try {
      await client.exportRows(activeConnectionId, sql, format)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [client, activeConnectionId, sql])

  const dismissError = useCallback(() => setError(null), [])

  return {
    online, connections, activeConnectionId, tree, expandedColumns, sql, result, error, loading,
    refreshConnections, selectConnection, loadTableColumns, setSql, runQuery, insertSelect, exportResult, dismissError,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/frontend/useSidecar.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSidecar.ts tests/frontend/useSidecar.test.ts
git commit -m "feat: [frontend] useSidecar hook owning app state + actions"
```

---

## Task 6: `App` 3-pane layout + `ErrorBanner` + `Spinner`

**Files:**
- Create: `src/components/Spinner.tsx`
- Create: `src/components/ErrorBanner.tsx`
- Create: `src/App.tsx`
- Test: `tests/frontend/ErrorBanner.test.tsx`

- [ ] **Step 1: Write the failing test for ErrorBanner**

Create `tests/frontend/ErrorBanner.test.tsx`:

```tsx
import { test, expect } from 'bun:test'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBanner } from '../../src/components/ErrorBanner'
import { ApiError } from '../../src/api/client'

test('maps BLACKLISTED to a friendly message', () => {
  render(<ErrorBanner error={new ApiError('BLACKLISTED', 'raw', 403)} onDismiss={() => {}} />)
  expect(screen.getByText('此表受保護，無法存取')).toBeDefined()
})

test('falls back to a generic message for unknown codes', () => {
  render(<ErrorBanner error={new ApiError('WEIRD', 'raw', 500)} onDismiss={() => {}} />)
  expect(screen.getByText('發生未預期錯誤')).toBeDefined()
})

test('renders nothing when error is null', () => {
  const { container } = render(<ErrorBanner error={null} onDismiss={() => {}} />)
  expect(container.textContent).toBe('')
})

test('dismiss button fires onDismiss', () => {
  let dismissed = false
  render(<ErrorBanner error={new ApiError('CONNECTION', 'raw', 502)} onDismiss={() => { dismissed = true }} />)
  fireEvent.click(screen.getByRole('button', { name: /關閉/ }))
  expect(dismissed).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/ErrorBanner.test.tsx`
Expected: FAIL — `Cannot find module '../../src/components/ErrorBanner'`.

- [ ] **Step 3: Implement Spinner**

Create `src/components/Spinner.tsx`:

```tsx
import { Loader2 } from 'lucide-react'

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ? <span>{label}</span> : null}
    </div>
  )
}
```

- [ ] **Step 4: Implement ErrorBanner**

Create `src/components/ErrorBanner.tsx`:

```tsx
import { X } from 'lucide-react'
import type { ApiError } from '../api/client'

const FRIENDLY: Record<string, string> = {
  BLACKLISTED: '此表受保護，無法存取',
  PERMISSION: '唯讀模式，不允許寫入語句',
  NOT_OPEN: '連線未開啟，正在重新連線…',
  CONNECTION: '資料庫連線失敗',
  BAD_REQUEST: '請求格式錯誤',
}

export function ErrorBanner({ error, onDismiss }: { error: ApiError | null; onDismiss: () => void }) {
  if (!error) return null
  const message = FRIENDLY[error.code] ?? '發生未預期錯誤'
  if (!FRIENDLY[error.code]) console.error('[dbcli] unexpected error:', error.code, error.message)
  return (
    <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
      <span>{message}</span>
      <button type="button" aria-label="關閉" onClick={onDismiss} className="rounded p-1 hover:bg-red-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/frontend/ErrorBanner.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 6: Implement App (wires the hook + views)**

Create `src/App.tsx`. Views are imported from Tasks 7–10; until those land, `bun build` of App fails — that is expected and resolved by Task 11's integration step. (Each later task tests its own view in isolation.)

```tsx
import { useSidecar } from './hooks/useSidecar'
import { ErrorBanner } from './components/ErrorBanner'
import { Sidebar } from './views/Sidebar'
import { Editor } from './views/Editor'
import { ResultGrid } from './views/ResultGrid'
import { ExportButton } from './views/ExportButton'

export function App() {
  const s = useSidecar()

  if (!s.online) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-600">
        <p className="text-lg">引擎未連線</p>
        <button
          type="button"
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
      <ErrorBanner error={s.error} onDismiss={s.dismissError} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          connections={s.connections}
          activeConnectionId={s.activeConnectionId}
          tree={s.tree}
          expandedColumns={s.expandedColumns}
          onSelectConnection={s.selectConnection}
          onLoadColumns={s.loadTableColumns}
          onInsertSelect={s.insertSelect}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-gray-200 p-2">
            <Editor sql={s.sql} loading={s.loading} onChange={s.setSql} onRun={s.runQuery} />
            <ExportButton hasResult={!!s.result} onExport={s.exportResult} />
          </div>
          <ResultGrid result={s.result} />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/Spinner.tsx src/components/ErrorBanner.tsx src/App.tsx tests/frontend/ErrorBanner.test.tsx
git commit -m "feat: [frontend] App 3-pane shell + ErrorBanner + Spinner"
```

---

## Task 7: `Sidebar` view

**Files:**
- Create: `src/views/Sidebar.tsx`
- Test: `tests/frontend/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/Sidebar.test.tsx`:

```tsx
import { test, expect } from 'bun:test'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '../../src/views/Sidebar'
import type { ConnectionSummary, TreeTable, TableColumnDto } from '../../src/api/types'

const connections: ConnectionSummary[] = [
  { name: 'prod', system: 'postgresql', isDefault: true },
  { name: 'staging', system: 'mysql', isDefault: false },
]
const tree: TreeTable[] = [{ name: 'users', type: 'table' }, { name: 'v_active', type: 'view' }]
const expanded: Record<string, TableColumnDto[]> = { users: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }] }

function setup(over: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const calls = { select: [] as string[], load: [] as string[], insert: [] as string[] }
  render(
    <Sidebar
      connections={connections}
      activeConnectionId="prod"
      tree={tree}
      expandedColumns={expanded}
      onSelectConnection={(id) => calls.select.push(id)}
      onLoadColumns={(t) => calls.load.push(t)}
      onInsertSelect={(t) => calls.insert.push(t)}
      {...over}
    />,
  )
  return calls
}

test('renders the connection list with default marker', () => {
  setup()
  expect(screen.getByText('prod')).toBeDefined()
  expect(screen.getByText('staging')).toBeDefined()
})

test('clicking a connection calls onSelectConnection', () => {
  const calls = setup()
  fireEvent.click(screen.getByText('staging'))
  expect(calls.select).toEqual(['staging'])
})

test('renders the schema tree tables', () => {
  setup()
  expect(screen.getByText('users')).toBeDefined()
  expect(screen.getByText('v_active')).toBeDefined()
})

test('clicking a table loads its columns', () => {
  const calls = setup()
  fireEvent.click(screen.getByText('v_active'))
  expect(calls.load).toEqual(['v_active'])
})

test('expanded columns are shown with a PK marker', () => {
  setup()
  expect(screen.getByText('id')).toBeDefined()
  expect(screen.getByText(/PK/)).toBeDefined()
})

test('the insert-select button calls onInsertSelect', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: /查詢 users/ }))
  expect(calls.insert).toEqual(['users'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/Sidebar.test.tsx`
Expected: FAIL — `Cannot find module '../../src/views/Sidebar'`.

- [ ] **Step 3: Implement Sidebar**

Create `src/views/Sidebar.tsx`:

```tsx
import { Table2, Eye, Play, Database, KeyRound } from 'lucide-react'
import type { ConnectionSummary, TreeTable, TableColumnDto } from '../api/types'

export interface SidebarProps {
  connections: ConnectionSummary[]
  activeConnectionId: string | null
  tree: TreeTable[]
  expandedColumns: Record<string, TableColumnDto[]>
  onSelectConnection(id: string): void
  onLoadColumns(table: string): void
  onInsertSelect(table: string): void
}

export function Sidebar(props: SidebarProps) {
  const { connections, activeConnectionId, tree, expandedColumns } = props
  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-gray-50 text-sm">
      <section className="border-b border-gray-200 p-2">
        <h2 className="mb-1 flex items-center gap-1 px-1 text-xs font-semibold uppercase text-gray-400">
          <Database className="h-3 w-3" /> 連線
        </h2>
        <ul>
          {connections.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => props.onSelectConnection(c.name)}
                className={`flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-gray-200 ${
                  c.name === activeConnectionId ? 'bg-gray-200 font-medium' : ''
                }`}
              >
                <span>{c.name}</span>
                {c.isDefault ? <span className="text-xs text-gray-400">預設</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="min-h-0 flex-1 overflow-auto p-2">
        <h2 className="mb-1 px-1 text-xs font-semibold uppercase text-gray-400">資料表</h2>
        <ul>
          {tree.map((t) => {
            const columns = expandedColumns[t.name]
            return (
              <li key={t.name}>
                <div className="group flex items-center gap-1 rounded px-1 hover:bg-gray-200">
                  <button
                    type="button"
                    onClick={() => props.onLoadColumns(t.name)}
                    className="flex flex-1 items-center gap-1 py-1 text-left"
                  >
                    {t.type === 'view' ? <Eye className="h-3 w-3 text-gray-400" /> : <Table2 className="h-3 w-3 text-gray-400" />}
                    <span>{t.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`查詢 ${t.name}`}
                    onClick={() => props.onInsertSelect(t.name)}
                    className="p-1 opacity-0 hover:text-gray-800 group-hover:opacity-100"
                  >
                    <Play className="h-3 w-3" />
                  </button>
                </div>
                {columns ? (
                  <ul className="ml-5 border-l border-gray-200 pl-2 text-xs text-gray-600">
                    {columns.map((col) => (
                      <li key={col.name} className="flex items-center gap-1 py-0.5">
                        {col.primaryKey ? <KeyRound className="h-3 w-3 text-amber-500" /> : null}
                        <span>{col.name}</span>
                        <span className="text-gray-400">{col.type}</span>
                        {col.primaryKey ? <span className="text-amber-600">PK</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>
    </aside>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/frontend/Sidebar.test.tsx`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/Sidebar.tsx tests/frontend/Sidebar.test.tsx
git commit -m "feat: [frontend] Sidebar — connections + schema tree + insert-select"
```

---

## Task 8: `Editor` view

**Files:**
- Create: `src/views/Editor.tsx`
- Test: `tests/frontend/Editor.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/Editor.test.tsx`:

```tsx
import { test, expect } from 'bun:test'
import { render, screen, fireEvent } from '@testing-library/react'
import { Editor } from '../../src/views/Editor'

function setup(over: Partial<React.ComponentProps<typeof Editor>> = {}) {
  const calls = { change: [] as string[], run: 0 }
  render(
    <Editor
      sql="SELECT 1"
      loading={false}
      onChange={(s) => calls.change.push(s)}
      onRun={() => { calls.run++ }}
      {...over}
    />,
  )
  return calls
}

test('typing updates sql via onChange', () => {
  const calls = setup()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'SELECT 2' } })
  expect(calls.change).toEqual(['SELECT 2'])
})

test('Run button triggers onRun', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: /Run/ }))
  expect(calls.run).toBe(1)
})

test('Cmd/Ctrl+Enter triggers onRun', () => {
  const calls = setup()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true })
  expect(calls.run).toBe(1)
})

test('plain Enter does not trigger onRun', () => {
  const calls = setup()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(calls.run).toBe(0)
})

test('Run is disabled while loading', () => {
  setup({ loading: true })
  expect((screen.getByRole('button', { name: /Run/ }) as HTMLButtonElement).disabled).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/Editor.test.tsx`
Expected: FAIL — `Cannot find module '../../src/views/Editor'`.

- [ ] **Step 3: Implement Editor**

Create `src/views/Editor.tsx`:

```tsx
import type { KeyboardEvent } from 'react'
import { Play } from 'lucide-react'

export interface EditorProps {
  sql: string
  loading: boolean
  onChange(sql: string): void
  onRun(): void
}

export function Editor({ sql, loading, onChange, onRun }: EditorProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onRun()
    }
  }
  return (
    <div className="flex flex-1 items-start gap-2">
      <textarea
        value={sql}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        placeholder="SELECT * FROM …   (Cmd/Ctrl+Enter 執行)"
        className="h-20 flex-1 resize-y rounded border border-gray-300 p-2 font-mono text-sm focus:border-gray-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={onRun}
        disabled={loading}
        className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
      >
        <Play className="h-4 w-4" /> Run
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/frontend/Editor.test.tsx`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/Editor.tsx tests/frontend/Editor.test.tsx
git commit -m "feat: [frontend] SQL Editor with Cmd/Ctrl+Enter to run"
```

---

## Task 9: `ResultGrid` virtual scroll + sorting

**Files:**
- Create: `src/views/grid-virtual.ts`
- Create: `src/views/ResultGrid.tsx`
- Test: `tests/frontend/grid-virtual.test.ts`
- Test: `tests/frontend/ResultGrid.test.tsx`

- [ ] **Step 1: Write the failing test for pure helpers**

Create `tests/frontend/grid-virtual.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { computeVisibleRange, sortRows, nextSortDir } from '../../src/views/grid-virtual'

test('computeVisibleRange returns the slice around scrollTop with overscan', () => {
  const r = computeVisibleRange({ scrollTop: 1000, viewportHeight: 300, rowHeight: 20, rowCount: 1000, overscan: 5 })
  // first visible = 1000/20 = 50; minus overscan 5 => 45
  expect(r.start).toBe(45)
  // visible count = ceil(300/20)=15; end = 50+15+overscan = 70
  expect(r.end).toBe(70)
  expect(r.topPad).toBe(45 * 20)
  expect(r.bottomPad).toBe((1000 - 70) * 20)
})

test('computeVisibleRange clamps to bounds', () => {
  const r = computeVisibleRange({ scrollTop: 0, viewportHeight: 300, rowHeight: 20, rowCount: 3, overscan: 5 })
  expect(r.start).toBe(0)
  expect(r.end).toBe(3)
  expect(r.bottomPad).toBe(0)
})

test('nextSortDir cycles none -> asc -> desc -> none', () => {
  expect(nextSortDir(null)).toBe('asc')
  expect(nextSortDir('asc')).toBe('desc')
  expect(nextSortDir('desc')).toBe(null)
})

test('sortRows sorts numbers ascending and descending', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }]
  expect(sortRows(rows, 'n', 'asc').map((r) => r.n)).toEqual([1, 2, 3])
  expect(sortRows(rows, 'n', 'desc').map((r) => r.n)).toEqual([3, 2, 1])
})

test('sortRows with null direction returns original order (new array)', () => {
  const rows = [{ n: 3 }, { n: 1 }]
  const out = sortRows(rows, 'n', null)
  expect(out).toEqual(rows)
  expect(out).not.toBe(rows)
})

test('sortRows compares strings case-insensitively-ish via localeCompare', () => {
  const rows = [{ s: 'banana' }, { s: 'apple' }]
  expect(sortRows(rows, 's', 'asc').map((r) => r.s)).toEqual(['apple', 'banana'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/grid-virtual.test.ts`
Expected: FAIL — `Cannot find module '../../src/views/grid-virtual'`.

- [ ] **Step 3: Implement the pure helpers**

Create `src/views/grid-virtual.ts`:

```ts
export type SortDir = 'asc' | 'desc' | null

export interface VisibleRangeInput {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  rowCount: number
  overscan: number
}

export interface VisibleRange {
  start: number
  end: number
  topPad: number
  bottomPad: number
}

/** Which row indices to actually render, plus spacer heights above/below. */
export function computeVisibleRange(input: VisibleRangeInput): VisibleRange {
  const { scrollTop, viewportHeight, rowHeight, rowCount, overscan } = input
  const first = Math.floor(scrollTop / rowHeight)
  const visibleCount = Math.ceil(viewportHeight / rowHeight)
  const start = Math.max(0, first - overscan)
  const end = Math.min(rowCount, first + visibleCount + overscan)
  return {
    start,
    end,
    topPad: start * rowHeight,
    bottomPad: Math.max(0, (rowCount - end) * rowHeight),
  }
}

/** Three-state cycle for clicking a column header. */
export function nextSortDir(current: SortDir): SortDir {
  if (current === null) return 'asc'
  if (current === 'asc') return 'desc'
  return null
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

/** Returns a NEW array. With dir=null, preserves original order. */
export function sortRows<T extends Record<string, unknown>>(rows: T[], field: string, dir: SortDir): T[] {
  if (dir === null) return [...rows]
  const sorted = [...rows].sort((ra, rb) => compareValues(ra[field], rb[field]))
  return dir === 'desc' ? sorted.reverse() : sorted
}
```

- [ ] **Step 4: Run test to verify pure helpers pass**

Run: `bun test tests/frontend/grid-virtual.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Write the failing test for the component**

Create `tests/frontend/ResultGrid.test.tsx`:

```tsx
import { test, expect } from 'bun:test'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResultGrid } from '../../src/views/ResultGrid'
import type { QueryResultDto } from '../../src/api/types'

const small: QueryResultDto = {
  fields: ['id', 'name'],
  rows: [{ id: 2, name: 'b' }, { id: 1, name: 'a' }],
  rowCount: 2,
  ms: 7,
}

test('renders headers from fields', () => {
  render(<ResultGrid result={small} />)
  expect(screen.getByText('id')).toBeDefined()
  expect(screen.getByText('name')).toBeDefined()
})

test('renders cell values', () => {
  render(<ResultGrid result={small} />)
  expect(screen.getByText('a')).toBeDefined()
  expect(screen.getByText('b')).toBeDefined()
})

test('footer shows rowCount and ms', () => {
  render(<ResultGrid result={small} />)
  expect(screen.getByText(/2/)).toBeDefined()
  expect(screen.getByText(/7/)).toBeDefined()
})

test('clicking a header sorts ascending by that column', () => {
  render(<ResultGrid result={small} />)
  fireEvent.click(screen.getByText('id'))
  const cells = screen.getAllByRole('cell').filter((c) => c.getAttribute('data-col') === 'id')
  expect(cells[0]!.textContent).toBe('1')
})

test('shows an empty-state hint when result is null', () => {
  render(<ResultGrid result={null} />)
  expect(screen.getByText(/尚無結果/)).toBeDefined()
})

test('large result only renders a window of rows, not all', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i }))
  const big: QueryResultDto = { fields: ['id'], rows, rowCount: 5000, ms: 1 }
  render(<ResultGrid result={big} />)
  const cells = screen.getAllByRole('cell').filter((c) => c.getAttribute('data-col') === 'id')
  // virtual window must be far smaller than 5000
  expect(cells.length).toBeLessThan(200)
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test tests/frontend/ResultGrid.test.tsx`
Expected: FAIL — `Cannot find module '../../src/views/ResultGrid'`.

- [ ] **Step 7: Implement ResultGrid**

Create `src/views/ResultGrid.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react'
import type { QueryResultDto } from '../api/types'
import { computeVisibleRange, nextSortDir, sortRows, type SortDir } from './grid-virtual'

const ROW_HEIGHT = 28
const VIEWPORT_HEIGHT = 480
const OVERSCAN = 8

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function ResultGrid({ result }: { result: QueryResultDto | null }) {
  const [scrollTop, setScrollTop] = useState(0)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    if (!result) return []
    if (!sortField || !sortDir) return result.rows
    return sortRows(result.rows, sortField, sortDir)
  }, [result, sortField, sortDir])

  if (!result) {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-400">尚無結果，執行查詢以查看資料</div>
  }

  const range = computeVisibleRange({
    scrollTop,
    viewportHeight: VIEWPORT_HEIGHT,
    rowHeight: ROW_HEIGHT,
    rowCount: sorted.length,
    overscan: OVERSCAN,
  })
  const visible = sorted.slice(range.start, range.end)

  const onHeaderClick = (field: string) => {
    if (field === sortField) {
      const dir = nextSortDir(sortDir)
      setSortDir(dir)
      if (dir === null) setSortField(null)
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto"
        style={{ maxHeight: VIEWPORT_HEIGHT }}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {result.fields.map((f) => (
                <th
                  key={f}
                  onClick={() => onHeaderClick(f)}
                  className="cursor-pointer select-none border-b border-gray-300 px-3 py-1 text-left font-medium"
                >
                  {f}
                  {sortField === f ? <span className="ml-1 text-gray-400">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {range.topPad > 0 ? (
              <tr style={{ height: range.topPad }}><td colSpan={result.fields.length} /></tr>
            ) : null}
            {visible.map((row, i) => (
              <tr key={range.start + i} style={{ height: ROW_HEIGHT }} className="border-b border-gray-100">
                {result.fields.map((f) => (
                  <td key={f} data-col={f} className="truncate px-3 font-mono">{renderCell(row[f])}</td>
                ))}
              </tr>
            ))}
            {range.bottomPad > 0 ? (
              <tr style={{ height: range.bottomPad }}><td colSpan={result.fields.length} /></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-gray-200 px-3 py-1 text-xs text-gray-500">
        {result.rowCount} 列{result.ms !== null ? ` · ${result.ms} ms` : ''}
      </footer>
    </div>
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `bun test tests/frontend/ResultGrid.test.tsx`
Expected: PASS (all 6 tests). The large-result test confirms virtualization (cells far fewer than 5000).

- [ ] **Step 9: Commit**

```bash
git add src/views/grid-virtual.ts src/views/ResultGrid.tsx tests/frontend/grid-virtual.test.ts tests/frontend/ResultGrid.test.tsx
git commit -m "feat: [frontend] ResultGrid with self-rolled virtual scroll + header sort"
```

---

## Task 10: `ExportButton` view

**Files:**
- Create: `src/views/ExportButton.tsx`
- Test: `tests/frontend/ExportButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/ExportButton.test.tsx`:

```tsx
import { test, expect } from 'bun:test'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExportButton } from '../../src/views/ExportButton'

function setup(over: Partial<React.ComponentProps<typeof ExportButton>> = {}) {
  const calls: Array<'csv' | 'json'> = []
  render(<ExportButton hasResult={true} onExport={(f) => calls.push(f)} {...over} />)
  return calls
}

test('selecting CSV calls onExport with csv', () => {
  const calls = setup()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'csv' } })
  expect(calls).toEqual(['csv'])
})

test('selecting JSON calls onExport with json', () => {
  const calls = setup()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'json' } })
  expect(calls).toEqual(['json'])
})

test('is disabled when there is no result', () => {
  setup({ hasResult: false })
  expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/frontend/ExportButton.test.tsx`
Expected: FAIL — `Cannot find module '../../src/views/ExportButton'`.

- [ ] **Step 3: Implement ExportButton**

Create `src/views/ExportButton.tsx`:

```tsx
import { Download } from 'lucide-react'

export interface ExportButtonProps {
  hasResult: boolean
  onExport(format: 'csv' | 'json'): void
}

export function ExportButton({ hasResult, onExport }: ExportButtonProps) {
  return (
    <label className="flex items-center gap-1 text-sm text-gray-600">
      <Download className="h-4 w-4" />
      <select
        value=""
        disabled={!hasResult}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'csv' || v === 'json') onExport(v)
          e.target.value = ''
        }}
        className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
      >
        <option value="" disabled>匯出</option>
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
    </label>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/frontend/ExportButton.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/ExportButton.tsx tests/frontend/ExportButton.test.tsx
git commit -m "feat: [frontend] ExportButton CSV/JSON dropdown"
```

---

## Task 11: Integration — typecheck, build, full suite, manual smoke

**Files:** none new (wires everything from Tasks 1–10).

- [ ] **Step 1: Full type check**

Run: `bunx tsc --noEmit`
Expected: PASS with zero errors (all `App` imports now resolve; all view prop types line up).

- [ ] **Step 2: Run the entire test suite**

Run: `bun test`
Expected: PASS — sidecar + dev + frontend tests all green.

- [ ] **Step 3: Production build sanity**

Run: `bun run build`
Expected: `built N files to ./dist` and a `dist/` containing an HTML file + hashed JS/CSS (Tailwind compiled). No build errors.

- [ ] **Step 4: Manual smoke against a real/test DB**

Prerequisite: a working `.dbcli` v2 config in the project (the repo already has a `.dbcli/` dir). Then:

Run: `bun run dev`
Expected: console prints `http://localhost:3000/?port=<n>&token=<hex>`. Open it. Verify:
  1. The sidebar lists connections; clicking one loads the schema tree.
  2. Clicking a table expands its columns (PK marked).
  3. The insert-select (▶) button fills `SELECT * FROM <table> LIMIT 100`.
  4. Cmd/Ctrl+Enter runs the query; the grid shows rows; footer shows row count + ms.
  5. Clicking a header sorts; clicking again reverses; third click clears.
  6. Export → CSV downloads a file; Export → JSON downloads a file.
  7. Run a write statement (e.g. `DELETE FROM ...`) → ErrorBanner shows "唯讀模式，不允許寫入語句".
  8. Stop the sidecar (Ctrl+C kills both) and reload → "引擎未連線" page with a 重試 button.

- [ ] **Step 5: Commit any smoke-test fixups**

If the smoke test surfaced issues, fix them with focused commits referencing the affected file. If everything worked first try, there is nothing to commit here — note that in the task handoff.

- [ ] **Step 6: Final review commit (docs/README touch-up if needed)**

Update `README.md` with a short "Frontend dev" section if it lacks one:

```bash
git add README.md
git commit -m "docs: [frontend] add dev/build usage to README"
```

---

## Self-Review (performed against the spec)

- **§2.1 dev harness:** Task 2 (spawn + ready-line + URL injection) and Task 6 offline page (reload). Kill-on-exit covered in `dev/serve.ts`. ✓
- **§2.2 CORS:** Task 1 — `*` origin, methods, headers, OPTIONS 204 before auth, `/health` unchanged behavior + header. No `Allow-Credentials`. ✓
- **§2.3 module layout:** all of `api/`, `hooks/`, `views/`, `components/`, `App.tsx`, entry files created across Tasks 3–10 at the exact spec paths. ✓
- **client.ts function table:** every row (`health`/`listConnections`/`openConnection`/`closeConnection`/`query`/`schemaTree`/`schemaTable`/`exportRows`) implemented with bearer token + ApiError on non-2xx + blob download in Task 4. ✓
- **types.ts DTOs:** all five interfaces match the spec and the verified dbcli core subset (Task 4). ✓
- **useSidecar:** state + every listed action incl. NOT_OPEN reopen-retry-once and startup health check (Task 5). ✓
- **Views:** Sidebar/Editor/ResultGrid (virtual scroll + 3-state sort + footer + empty state)/ExportButton (disabled when no result) — Tasks 7–10, each with the behaviors §2.3 lists. ✓
- **§3 styling/build:** Tailwind v4 + Inter, `bun run dev` (HMR), `bun run build` prod, dependency promotions — Task 3. ✓
- **§4 error table:** every code mapped in `ErrorBanner` (Task 6) + retry logic (Task 5) + offline page (Task 6). ✓
- **§5 test strategy:** client fake-fetch, view tests with injected props/fake client, sidecar CORS tests, virtual-scroll pure-function test — all present; 80% target is met by per-unit coverage. ✓
- **§6 component boundaries:** client = HTTP only; useSidecar = sole client consumer; views via props; virtual-scroll pure helpers extracted to `grid-virtual.ts`. ✓
- **Type consistency check:** `DbClient` method names are identical across client.ts, useSidecar.ts, and all test fakes; `SidebarProps`/`EditorProps`/`ExportButtonProps`/`ResultGrid` prop names match `App.tsx` usage; `SortDir`/`computeVisibleRange`/`sortRows`/`nextSortDir` signatures match between `grid-virtual.ts` and `ResultGrid.tsx`/tests. ✓

No placeholders; every code step contains complete content.
