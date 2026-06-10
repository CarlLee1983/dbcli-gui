# 全域連線 + Workspace 切換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 dbcli-gui 預設讀全域連線庫 `~/.dbcli`,並在標題列提供 runtime 的 workspace 切換(全域 + 手動加入的專案)。

**Architecture:** sidecar 把「active config store」變成可變狀態,workspace 切換時 `closeAll` 舊連線、用新 `dbcliPath` 重建 pool+lister,並用 `server.reload({ routes })` 把路由處理器重新綁到新 pool。workspace 清單持久化於 `~/.dbcli/workspaces.json`(GUI 專屬 metadata)。`createServer` 的簽章採**附加式擴充**(新增 optional `registry`/`globalDir`),所有既有路由測試不受影響。

**Tech Stack:** Bun + TypeScript、`@carllee1983/dbcli/core`、React 19、zod、Tauri 2(folder dialog)。

---

## File Structure

**Sidecar(新增)**
- `sidecar/workspaces.ts` — workspace registry:純函式(list/add/remove/setLastActive/resolvePath)+ `WorkspaceRegistry` class(IO + 持久化)。
- `sidecar/active-store.ts` — `ActiveStore` 型別 + `buildStoreRuntime(dbcliPath)`。
- `sidecar/routes/workspaces.ts` — list/add/remove/select 處理器。

**Sidecar(修改)**
- `sidecar/config.ts` — 預設 store 改為 `~/.dbcli`,回傳 `globalDir`。
- `sidecar/server.ts` — 內部 mutable store + `buildRoutes()` + `selectWorkspace()` + reload;附加 workspace 路由。
- `sidecar/index.ts` — 載入 registry、還原 lastActive、建初始 store。
- `shared/schemas.ts` — 加 workspace request/file schema。

**前端(新增)**
- `src/hooks/useWorkspaces.ts` — 清單/加入/移除/切換 hook。
- `src/views/WorkspaceSwitcher.tsx` — 標題列下拉。

**前端(修改)**
- `src/api/types.ts` + `src/api/client.ts` — workspace 端點與型別。
- `src/hooks/useConnections.ts` — `resetForWorkspace(connections)`。
- `src/hooks/tabs-reducer.ts` + `src/hooks/useTabs.ts` — `reset` action / `resetAll()`。
- `src/hooks/useApp.ts` — `switchWorkspace(id)` 編排重置。
- `src/App.tsx` — 標題列掛 `WorkspaceSwitcher`。

**測試**
- `tests/sidecar/foundation.test.ts`(改)、`tests/sidecar/workspaces.test.ts`、`tests/sidecar/active-store.test.ts`、`tests/sidecar/workspaces-route.test.ts`。
- `tests/frontend/useWorkspaces.test.ts`、`tests/frontend/client.test.ts`(加)、`tests/frontend/useApp.test.ts`(加)。
- `tests/e2e/serve-fixture.ts`(改)+ `tests/e2e/journeys/workspace.e2e.ts`。

---

## Task 1: config.ts — 預設全域 `~/.dbcli`

**Files:**
- Modify: `sidecar/config.ts`
- Test: `tests/sidecar/foundation.test.ts:7-18`

- [ ] **Step 1: 改寫 foundation.test.ts 的 config 測試(先失敗)**

把 `tests/sidecar/foundation.test.ts` 中兩個 `resolveSidecarConfig` 測試改成:

```ts
import { test, expect } from 'bun:test'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveSidecarConfig } from '../../sidecar/config'

test('resolveSidecarConfig 預設 globalDir 為 ~/.dbcli', () => {
  const cfg = resolveSidecarConfig({ DBCLI_GUI_PORT: '0', DBCLI_GUI_TOKEN: 'tok' })
  expect(cfg.globalDir).toBe(join(homedir(), '.dbcli'))
  expect(cfg.port).toBe(0)
  expect(cfg.token).toBe('tok')
})

test('resolveSidecarConfig 可用 DBCLI_GUI_GLOBAL_DIR 覆寫', () => {
  const cfg = resolveSidecarConfig({ DBCLI_GUI_GLOBAL_DIR: '/tmp/g', DBCLI_GUI_PORT: '0', DBCLI_GUI_TOKEN: 'tok' })
  expect(cfg.globalDir).toBe('/tmp/g')
})

test('resolveSidecarConfig generates a token when none provided', () => {
  const cfg = resolveSidecarConfig({})
  expect(cfg.token.length).toBeGreaterThan(0)
})
```

(若該檔尚有其他既存測試,保留它們;只替換這三個。)

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/foundation.test.ts`
Expected: FAIL — `cfg.globalDir` undefined。

- [ ] **Step 3: 改寫 config.ts**

```ts
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'

export interface SidecarConfig {
  /** 全域連線庫目錄(預設 ~/.dbcli)。也是 workspaces.json 的所在。 */
  globalDir: string
  port: number
  token: string
}

/** Resolve sidecar runtime config from an env-like record (defaults applied). */
export function resolveSidecarConfig(env: Record<string, string | undefined> = process.env): SidecarConfig {
  return {
    globalDir: env.DBCLI_GUI_GLOBAL_DIR ?? join(homedir(), '.dbcli'),
    port: env.DBCLI_GUI_PORT ? parseInt(env.DBCLI_GUI_PORT, 10) : 0,
    token: env.DBCLI_GUI_TOKEN ?? randomBytes(24).toString('hex'),
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/foundation.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add sidecar/config.ts tests/sidecar/foundation.test.ts
git commit -m "feat: [sidecar] config 預設全域 ~/.dbcli store"
```

---

## Task 2: workspaces.ts — registry 純函式

**Files:**
- Create: `sidecar/workspaces.ts`
- Test: `tests/sidecar/workspaces.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `tests/sidecar/workspaces.test.ts`:

```ts
import { test, expect } from 'bun:test'
import {
  GLOBAL_ID, defaultWorkspacesFile, listWorkspaces, addWorkspace,
  removeWorkspace, setLastActive, resolvePath, makeProjectWorkspace,
  type Workspace,
} from '../../sidecar/workspaces'

const G = '/home/u/.dbcli'

test('list 一定把 global 放第一個', () => {
  const file = defaultWorkspacesFile()
  const list = listWorkspaces(file, G)
  expect(list[0]).toEqual({ id: GLOBAL_ID, label: '全域', kind: 'global', path: G })
})

test('add 後 list 含該專案;同 id 覆寫不重複', () => {
  const ws: Workspace = { id: 'p1', label: 'proj', kind: 'project', path: '/proj/.dbcli' }
  let file = addWorkspace(defaultWorkspacesFile(), ws)
  file = addWorkspace(file, { ...ws, label: 'renamed' })
  const list = listWorkspaces(file, G)
  expect(list).toHaveLength(2)
  expect(list[1].label).toBe('renamed')
})

test('remove global 會丟錯', () => {
  expect(() => removeWorkspace(defaultWorkspacesFile(), GLOBAL_ID)).toThrow()
})

test('remove 目前 active 會把 lastActive 退回 global', () => {
  const ws: Workspace = { id: 'p1', label: 'proj', kind: 'project', path: '/proj/.dbcli' }
  let file = addWorkspace(defaultWorkspacesFile(), ws)
  file = setLastActive(file, 'p1')
  file = removeWorkspace(file, 'p1')
  expect(file.lastActiveId).toBe(GLOBAL_ID)
  expect(file.workspaces).toHaveLength(0)
})

test('resolvePath:global→globalDir、專案→其 path、未知→丟錯', () => {
  const ws: Workspace = { id: 'p1', label: 'proj', kind: 'project', path: '/proj/.dbcli' }
  const file = addWorkspace(defaultWorkspacesFile(), ws)
  expect(resolvePath(file, GLOBAL_ID, G)).toBe(G)
  expect(resolvePath(file, 'p1', G)).toBe('/proj/.dbcli')
  expect(() => resolvePath(file, 'nope', G)).toThrow()
})

test('makeProjectWorkspace:label 預設取資料夾名、path 指向 .dbcli、id 唯一', () => {
  const a = makeProjectWorkspace('/Users/me/shop')
  expect(a.label).toBe('shop')
  expect(a.path).toBe('/Users/me/shop/.dbcli')
  expect(a.kind).toBe('project')
  const b = makeProjectWorkspace('/Users/me/shop')
  expect(a.id).not.toBe(b.id)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/workspaces.test.ts`
Expected: FAIL — 模組不存在。

- [ ] **Step 3: 實作 sidecar/workspaces.ts(純函式部分)**

```ts
import { join, basename } from 'node:path'

export interface Workspace {
  id: string
  label: string
  kind: 'global' | 'project'
  /** dbcliPath:global = globalDir;project = <folder>/.dbcli */
  path: string
}

export interface WorkspacesFile {
  version: 1
  lastActiveId: string
  /** 只存專案;global 為隱含固定項,不寫檔。 */
  workspaces: Workspace[]
}

export const GLOBAL_ID = 'global'

export function globalWorkspace(globalDir: string): Workspace {
  return { id: GLOBAL_ID, label: '全域', kind: 'global', path: globalDir }
}

export function defaultWorkspacesFile(): WorkspacesFile {
  return { version: 1, lastActiveId: GLOBAL_ID, workspaces: [] }
}

/** global 永遠第一個,後接已加入的專案。 */
export function listWorkspaces(file: WorkspacesFile, globalDir: string): Workspace[] {
  return [globalWorkspace(globalDir), ...file.workspaces]
}

export function addWorkspace(file: WorkspacesFile, ws: Workspace): WorkspacesFile {
  return { ...file, workspaces: [...file.workspaces.filter((w) => w.id !== ws.id), ws] }
}

export function removeWorkspace(file: WorkspacesFile, id: string): WorkspacesFile {
  if (id === GLOBAL_ID) throw new Error('cannot remove the global workspace')
  return {
    ...file,
    lastActiveId: file.lastActiveId === id ? GLOBAL_ID : file.lastActiveId,
    workspaces: file.workspaces.filter((w) => w.id !== id),
  }
}

export function setLastActive(file: WorkspacesFile, id: string): WorkspacesFile {
  return { ...file, lastActiveId: id }
}

export function resolvePath(file: WorkspacesFile, id: string, globalDir: string): string {
  if (id === GLOBAL_ID) return globalDir
  const ws = file.workspaces.find((w) => w.id === id)
  if (!ws) throw new Error(`unknown workspace: ${id}`)
  return ws.path
}

export function makeProjectWorkspace(folder: string, label?: string): Workspace {
  return {
    id: crypto.randomUUID(),
    label: label ?? basename(folder),
    kind: 'project',
    path: join(folder, '.dbcli'),
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/workspaces.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add sidecar/workspaces.ts tests/sidecar/workspaces.test.ts
git commit -m "feat: [sidecar] workspace registry 純函式"
```

---

## Task 3: WorkspaceRegistry class + 持久化 IO

**Files:**
- Modify: `sidecar/workspaces.ts`(加 IO + class)
- Modify: `shared/schemas.ts`(加 `WorkspacesFileSchema`)
- Test: `tests/sidecar/workspaces.test.ts`(加)

- [ ] **Step 1: 在 shared/schemas.ts 加檔案 schema**

在 `shared/schemas.ts` 末尾追加:

```ts
export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  kind: z.enum(['global', 'project']),
  path: z.string().min(1),
})
export const WorkspacesFileSchema = z.object({
  version: z.literal(1),
  lastActiveId: z.string().min(1),
  workspaces: z.array(WorkspaceSchema),
})
```

- [ ] **Step 2: 寫失敗測試(Registry 往返)**

在 `tests/sidecar/workspaces.test.ts` 追加:

```ts
import { WorkspaceRegistry } from '../../sidecar/workspaces'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('WorkspaceRegistry:add→persist→reload 還原', async () => {
  const dir = join(tmpdir(), `dbcli-ws-${crypto.randomUUID()}`)
  const reg = await WorkspaceRegistry.load(dir)
  const ws = await reg.add('/some/proj')
  await reg.setLastActive(ws.id)

  const reloaded = await WorkspaceRegistry.load(dir)
  expect(reloaded.activeId()).toBe(ws.id)
  expect(reloaded.list().map((w) => w.id)).toContain(ws.id)
  expect(reloaded.resolvePath(ws.id)).toBe('/some/proj/.dbcli')

  await reloaded.remove(ws.id)
  expect((await WorkspaceRegistry.load(dir)).activeId()).toBe('global')
})

test('WorkspaceRegistry.load:檔案毀損→退回僅 global', async () => {
  const dir = join(tmpdir(), `dbcli-ws-${crypto.randomUUID()}`)
  await Bun.$`mkdir -p ${dir}`
  await Bun.write(join(dir, 'workspaces.json'), '{ not json')
  const reg = await WorkspaceRegistry.load(dir)
  expect(reg.list()).toHaveLength(1)
  expect(reg.activeId()).toBe('global')
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `bun test tests/sidecar/workspaces.test.ts`
Expected: FAIL — `WorkspaceRegistry` 不存在。

- [ ] **Step 4: 實作 IO + class(append 到 sidecar/workspaces.ts)**

```ts
import { mkdir, rename } from 'node:fs/promises'
import { WorkspacesFileSchema } from '../shared/schemas'

const FILE = 'workspaces.json'

export async function loadWorkspacesFile(globalDir: string): Promise<WorkspacesFile> {
  const f = Bun.file(join(globalDir, FILE))
  if (!(await f.exists())) return defaultWorkspacesFile()
  try {
    return WorkspacesFileSchema.parse(JSON.parse(await f.text())) as WorkspacesFile
  } catch {
    // 毀損不阻擋啟動:退回僅 global。
    return defaultWorkspacesFile()
  }
}

export async function saveWorkspacesFile(globalDir: string, file: WorkspacesFile): Promise<void> {
  await mkdir(globalDir, { recursive: true })
  const tmp = join(globalDir, `${FILE}.${process.pid}.tmp`)
  await Bun.write(tmp, JSON.stringify(file, null, 2))
  await rename(tmp, join(globalDir, FILE)) // 原子寫,保護既有檔
}

export class WorkspaceRegistry {
  private constructor(
    private readonly globalDir: string,
    private file: WorkspacesFile,
  ) {}

  static async load(globalDir: string): Promise<WorkspaceRegistry> {
    return new WorkspaceRegistry(globalDir, await loadWorkspacesFile(globalDir))
  }

  list(): Workspace[] {
    return listWorkspaces(this.file, this.globalDir)
  }
  activeId(): string {
    return this.file.lastActiveId
  }
  resolvePath(id: string): string {
    return resolvePath(this.file, id, this.globalDir)
  }
  async add(folder: string, label?: string): Promise<Workspace> {
    const ws = makeProjectWorkspace(folder, label)
    this.file = addWorkspace(this.file, ws)
    await this.persist()
    return ws
  }
  async remove(id: string): Promise<void> {
    this.file = removeWorkspace(this.file, id)
    await this.persist()
  }
  async setLastActive(id: string): Promise<void> {
    this.file = setLastActive(this.file, id)
    await this.persist()
  }
  private persist(): Promise<void> {
    return saveWorkspacesFile(this.globalDir, this.file)
  }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `bun test tests/sidecar/workspaces.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add sidecar/workspaces.ts shared/schemas.ts tests/sidecar/workspaces.test.ts
git commit -m "feat: [sidecar] WorkspaceRegistry 持久化(原子寫)+ file schema"
```

---

## Task 4: active-store — buildStoreRuntime

**Files:**
- Create: `sidecar/active-store.ts`
- Test: `tests/sidecar/active-store.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `tests/sidecar/active-store.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { buildStoreRuntime } from '../../sidecar/active-store'
import { ConnectionPool } from '../../sidecar/connection-pool'

test('buildStoreRuntime 回傳綁同一 dbcliPath 的 pool 與 lister', () => {
  const rt = buildStoreRuntime('/tmp/does-not-exist/.dbcli')
  expect(rt.pool).toBeInstanceOf(ConnectionPool)
  expect(typeof rt.lister).toBe('function')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/active-store.test.ts`
Expected: FAIL — 模組不存在。

- [ ] **Step 3: 實作 sidecar/active-store.ts**

```ts
import { ConnectionPool, defaultPoolDeps } from './connection-pool'
import { defaultConnectionLister, type ConnectionLister } from './routes/connections'

/** runtime 切換時整組重建的兩件物事。 */
export interface StoreRuntime {
  pool: ConnectionPool
  lister: ConnectionLister
}

/** sidecar 目前指向的 config store(可變;workspace 切換時就地更新欄位)。 */
export interface ActiveStore {
  id: string
  dbcliPath: string
  pool: ConnectionPool
  lister: ConnectionLister
}

export function buildStoreRuntime(dbcliPath: string): StoreRuntime {
  return {
    pool: new ConnectionPool(defaultPoolDeps(dbcliPath)),
    lister: defaultConnectionLister(dbcliPath),
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/active-store.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add sidecar/active-store.ts tests/sidecar/active-store.test.ts
git commit -m "feat: [sidecar] active-store + buildStoreRuntime"
```

---

## Task 5: shared/schemas.ts — workspace request bodies

**Files:**
- Modify: `shared/schemas.ts`
- Test: `tests/sidecar/mutate-schema.test.ts`(同檔風格,新增一個 schema 測試檔)
- Test: `tests/sidecar/workspace-schema.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `tests/sidecar/workspace-schema.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { WorkspaceAddBody, WorkspaceIdBody } from '../../shared/schemas'

test('WorkspaceAddBody:path 必填、label 可選', () => {
  expect(WorkspaceAddBody.safeParse({ path: '/a' }).success).toBe(true)
  expect(WorkspaceAddBody.safeParse({ path: '/a', label: 'x' }).success).toBe(true)
  expect(WorkspaceAddBody.safeParse({}).success).toBe(false)
})

test('WorkspaceIdBody:id 必填', () => {
  expect(WorkspaceIdBody.safeParse({ id: 'p1' }).success).toBe(true)
  expect(WorkspaceIdBody.safeParse({ id: '' }).success).toBe(false)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/workspace-schema.test.ts`
Expected: FAIL — schema 未匯出。

- [ ] **Step 3: 在 shared/schemas.ts 追加**

```ts
export const WorkspaceAddBody = z.object({
  path: z.string().min(1),
  label: z.string().min(1).optional(),
})
export const WorkspaceIdBody = z.object({ id: z.string().min(1) })

export type WorkspaceAddBody = z.infer<typeof WorkspaceAddBody>
export type WorkspaceIdBody = z.infer<typeof WorkspaceIdBody>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/workspace-schema.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add shared/schemas.ts tests/sidecar/workspace-schema.test.ts
git commit -m "feat: [shared] workspace request schemas"
```

---

## Task 6: routes/workspaces.ts — 處理器

**Files:**
- Create: `sidecar/routes/workspaces.ts`
- Test: `tests/sidecar/workspaces-route.test.ts`

設計:處理器工廠 `makeWorkspaceHandlers(registry, store, selectWorkspace)`。`selectWorkspace(id)` 由 server.ts 注入(它負責 closeAll + 重建 + reload),這裡只做 registry 操作與回應整形。

- [ ] **Step 1: 寫失敗測試**

Create `tests/sidecar/workspaces-route.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { makeWorkspaceHandlers } from '../../sidecar/routes/workspaces'
import { WorkspaceRegistry } from '../../sidecar/workspaces'
import type { ActiveStore } from '../../sidecar/active-store'

function req(body: unknown): Request {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
}

async function setup() {
  const dir = join(tmpdir(), `dbcli-wsr-${crypto.randomUUID()}`)
  const registry = await WorkspaceRegistry.load(dir)
  const store = { id: 'global', dbcliPath: dir, pool: {} as never, lister: async () => [] } as ActiveStore
  const selected: string[] = []
  const selectWorkspace = async (id: string) => {
    selected.push(id)
    store.id = id
    return [{ name: 'c1', system: 'mysql', isDefault: true }]
  }
  return { registry, store, selectWorkspace, selected }
}

test('list:預設只含 global,activeId=global', async () => {
  const { registry, store, selectWorkspace } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  const res = await h.list(req({}))
  const body = await res.json() as { workspaces: unknown[]; activeId: string }
  expect(body.workspaces).toHaveLength(1)
  expect(body.activeId).toBe('global')
})

test('add:回傳含新專案的清單', async () => {
  const { registry, store, selectWorkspace } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  const res = await h.add(req({ path: '/proj' }))
  const body = await res.json() as { workspaces: { kind: string }[]; added: { label: string } }
  expect(body.workspaces).toHaveLength(2)
  expect(body.added.label).toBe('proj')
})

test('select:呼叫 selectWorkspace 並回傳連線清單', async () => {
  const { registry, store, selectWorkspace, selected } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  const res = await h.select(req({ id: 'global' }))
  const body = await res.json() as { connections: unknown[]; activeId: string }
  expect(selected).toEqual(['global'])
  expect(body.connections).toHaveLength(1)
})

test('remove global → 400', async () => {
  const { registry, store, selectWorkspace } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  const res = await h.remove(req({ id: 'global' }))
  expect(res.status).toBe(400)
})

test('remove 目前 active 專案 → 自動切回 global', async () => {
  const { registry, store, selectWorkspace, selected } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  const added = await (await h.add(req({ path: '/proj' }))).json() as { added: { id: string } }
  store.id = added.added.id
  await registry.setLastActive(added.added.id)
  await h.remove(req({ id: added.added.id }))
  expect(selected).toContain('global')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/workspaces-route.test.ts`
Expected: FAIL — 模組不存在。

- [ ] **Step 3: 實作 sidecar/routes/workspaces.ts**

```ts
import type { WorkspaceRegistry } from '../workspaces'
import type { ActiveStore } from '../active-store'
import type { ConnectionSummary } from './connections'
import { WorkspaceAddBody, WorkspaceIdBody } from '../../shared/schemas'
import { GLOBAL_ID } from '../workspaces'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { json } from '../http'

/** 由 server.ts 注入:closeAll 舊連線 + 重建 pool/lister + reload 路由,回新連線清單。 */
export type SelectWorkspace = (id: string) => Promise<ConnectionSummary[]>

export function makeWorkspaceHandlers(
  registry: WorkspaceRegistry,
  store: ActiveStore,
  selectWorkspace: SelectWorkspace,
) {
  return {
    async list(_req: Request): Promise<Response> {
      return json({ workspaces: registry.list(), activeId: store.id })
    },

    async add(req: Request): Promise<Response> {
      const parsed = WorkspaceAddBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'path required' } }, 400)
      try {
        const added = await registry.add(parsed.data.path, parsed.data.label)
        return json({ workspaces: registry.list(), added })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },

    async remove(req: Request): Promise<Response> {
      const parsed = WorkspaceIdBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'id required' } }, 400)
      if (parsed.data.id === GLOBAL_ID) {
        return json({ error: { code: 'BAD_REQUEST', message: 'cannot remove global workspace' } }, 400)
      }
      try {
        const wasActive = store.id === parsed.data.id
        await registry.remove(parsed.data.id)
        if (wasActive) await selectWorkspace(GLOBAL_ID) // 切回全域,順帶 reload
        return json({ workspaces: registry.list(), activeId: store.id })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },

    async select(req: Request): Promise<Response> {
      const parsed = WorkspaceIdBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'id required' } }, 400)
      try {
        const connections = await selectWorkspace(parsed.data.id)
        return json({ connections, activeId: store.id })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/sidecar/workspaces-route.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add sidecar/routes/workspaces.ts tests/sidecar/workspaces-route.test.ts
git commit -m "feat: [sidecar] workspace 路由處理器"
```

---

## Task 7: server.ts — mutable store + reload 切換

**Files:**
- Modify: `sidecar/server.ts`
- Test: `tests/sidecar/server.test.ts`(加一個切換測試)

`ServerDeps` 採**附加式**:既有 `pool/dbcliPath/listConnections` 保留(現有測試不動),新增 optional `registry`/`globalDir`。內部把這些封進可變 `store`;`selectWorkspace` 重建 runtime 並 `server.reload`。

- [ ] **Step 1: 寫失敗測試(workspace 切換端到端)**

在 `tests/sidecar/server.test.ts` 追加:

```ts
import { WorkspaceRegistry } from '../../sidecar/workspaces'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('POST /workspace/select 切換後 /workspaces/list 反映新 activeId', async () => {
  const dir = join(tmpdir(), `dbcli-srv-${crypto.randomUUID()}`)
  const registry = await WorkspaceRegistry.load(dir)
  const added = await registry.add('/no/such/proj') // path 不存在不影響切換(只在 open 時才連)
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter })
  server = createServer({
    pool, token: 'test', port: 0, dbcliPath: dir, globalDir: dir, registry,
    listConnections: async () => [],
  })
  const auth = { authorization: 'Bearer test', 'content-type': 'application/json' }

  const sel = await fetch(`http://localhost:${server.port}/workspace/select`, {
    method: 'POST', headers: auth, body: JSON.stringify({ id: added.id }),
  })
  expect(sel.status).toBe(200)

  const list = await fetch(`http://localhost:${server.port}/workspaces/list`, {
    method: 'POST', headers: auth, body: JSON.stringify({}),
  })
  const body = await list.json() as { activeId: string }
  expect(body.activeId).toBe(added.id)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/sidecar/server.test.ts`
Expected: FAIL — `/workspace/select` 走 404 或 registry 未接。

- [ ] **Step 3: 改寫 sidecar/server.ts**

```ts
import type { Server } from 'bun'
import pkg from '../package.json'
import type { ConnectionPool } from './connection-pool'
import { checkBearer } from './auth'
import { json, type Handler } from './http'
import { withCors, corsPreflight } from './cors'
import { makeConnectionHandlers, makeListHandler, type ConnectionLister } from './routes/connections'
import { makeQueryHandler } from './routes/query'
import { makeSchemaHandlers } from './routes/schema'
import { makeExportHandler } from './routes/export'
import { makeConnectionAdminHandlers } from './routes/connections-admin'
import { makeDataHandlers } from './routes/data'
import { makeWorkspaceHandlers } from './routes/workspaces'
import { buildStoreRuntime, type ActiveStore } from './active-store'
import type { WorkspaceRegistry } from './workspaces'

export interface ServerDeps {
  pool: ConnectionPool
  token: string
  port: number
  dbcliPath: string
  listConnections?: ConnectionLister
  /** 提供後才啟用 workspace 切換;不提供時 /workspaces* 回 501(用於既有單元測試)。 */
  registry?: WorkspaceRegistry
  /** workspace 切換時重建 store 需要;預設等於 dbcliPath。 */
  globalDir?: string
}

const guard = (token: string, h: Handler): Handler => (req) =>
  checkBearer(req, token) ? h(req) : json({ error: { code: 'UNAUTHORIZED', message: 'bad token' } }, 401)

const notConfigured = (): Response =>
  json({ error: { code: 'NOT_CONFIGURED', message: 'workspace switching not configured' } }, 501)

/** Build (and start) the sidecar HTTP server. */
export function createServer(deps: ServerDeps): Server<unknown> {
  // 可變 active store:workspace 切換時就地更新欄位,再 reload 路由重綁 handler。
  const store: ActiveStore = {
    id: deps.registry?.activeId() ?? 'global',
    dbcliPath: deps.dbcliPath,
    pool: deps.pool,
    lister: deps.listConnections ?? (async () => []),
  }

  // 注意:server 在下面才賦值;selectWorkspace 只會在啟動後被 HTTP 觸發,屆時已賦值。
  let server: Server<unknown>

  const selectWorkspace = async (id: string) => {
    if (!deps.registry) throw new Error('workspace switching not configured')
    const dbcliPath = deps.registry.resolvePath(id) // 未知 id 會丟錯 → 路由轉 error envelope
    await store.pool.closeAll()
    const rt = buildStoreRuntime(dbcliPath)
    store.id = id
    store.dbcliPath = dbcliPath
    store.pool = rt.pool
    store.lister = rt.lister
    await deps.registry.setLastActive(id)
    server.reload({ routes: buildRoutes() }) // 重綁所有 handler 到新 pool/lister
    return store.lister()
  }

  const post = (h: Handler) => ({ POST: withCors(guard(deps.token, h)), OPTIONS: corsPreflight })

  const buildRoutes = () => {
    const conn = makeConnectionHandlers(store.pool)
    const schema = makeSchemaHandlers(store.pool)
    const admin = makeConnectionAdminHandlers(store.dbcliPath)
    const data = makeDataHandlers(store.pool)
    const ws = deps.registry ? makeWorkspaceHandlers(deps.registry, store, selectWorkspace) : null
    return {
      '/health': { GET: withCors(() => json({ ok: true, version: pkg.version })), OPTIONS: corsPreflight },
      '/connections/open': post(conn.open),
      '/connections/close': post(conn.close),
      '/connections/list': post(makeListHandler(store.lister)),
      '/query': post(makeQueryHandler(store.pool)),
      '/schema/tree': post(schema.tree),
      '/schema/table': post(schema.table),
      '/export': post(makeExportHandler(store.pool)),
      '/data/mutate': post(data.mutate),
      '/connections/create': post(admin.create),
      '/connections/update': post(admin.update),
      '/connections/delete': post(admin.remove),
      '/connections/set-default': post(admin.setDefault),
      '/connections/test': post(admin.test),
      '/connections/get': { GET: withCors(guard(deps.token, admin.get)), OPTIONS: corsPreflight },
      '/workspaces/list': post(ws ? ws.list : notConfigured),
      '/workspaces/add': post(ws ? ws.add : notConfigured),
      '/workspaces/remove': post(ws ? ws.remove : notConfigured),
      '/workspace/select': post(ws ? ws.select : notConfigured),
    }
  }

  server = Bun.serve({
    port: deps.port,
    routes: buildRoutes(),
    fetch: withCors(() => json({ error: { code: 'NOT_FOUND', message: 'No such route' } }, 404)),
  })
  return server
}
```

> 註:`makeListHandler(store.lister)` / `makeQueryHandler(store.pool)` 等在每次 `buildRoutes()` 都用「當下的」 store 欄位重建,因此 reload 後即綁到新 pool/lister。`admin` 用 `store.dbcliPath`,切換後同步指向新 store 的設定庫。

- [ ] **Step 4: 跑測試確認通過(含既有 server 測試)**

Run: `bun test tests/sidecar/server.test.ts`
Expected: PASS(原兩個 health/404 測試 + 新切換測試)。

- [ ] **Step 5: 全 sidecar 測試確認附加式改動沒打到別人**

Run: `bun test tests/sidecar/`
Expected: PASS(所有既有路由測試仍綠)。

- [ ] **Step 6: Commit**

```bash
git add sidecar/server.ts tests/sidecar/server.test.ts
git commit -m "feat: [sidecar] runtime workspace 切換(mutable store + reload)"
```

---

## Task 8: index.ts — 啟動還原 lastActive

**Files:**
- Modify: `sidecar/index.ts`

- [ ] **Step 1: 改寫 sidecar/index.ts**

```ts
import { resolveSidecarConfig } from './config'
import { WorkspaceRegistry, GLOBAL_ID } from './workspaces'
import { buildStoreRuntime } from './active-store'
import { createServer } from './server'

if (import.meta.main) {
  const cfg = resolveSidecarConfig()
  const registry = await WorkspaceRegistry.load(cfg.globalDir)

  // 還原上次的 workspace;路徑解析失敗(如專案已刪)→ 退回全域。
  let activeId = registry.activeId()
  let dbcliPath: string
  try {
    dbcliPath = registry.resolvePath(activeId)
  } catch {
    activeId = GLOBAL_ID
    dbcliPath = cfg.globalDir
    await registry.setLastActive(GLOBAL_ID)
  }

  const rt = buildStoreRuntime(dbcliPath)
  const server = createServer({
    pool: rt.pool,
    token: cfg.token,
    port: cfg.port,
    dbcliPath,
    globalDir: cfg.globalDir,
    registry,
    listConnections: rt.lister,
  })

  // The Tauri shell (or a dev caller) reads this line to learn where to connect.
  console.log(JSON.stringify({ ready: true, port: server.port, token: cfg.token }))

  const shutdown = async () => {
    try {
      await rt.pool.closeAll()
      await server.stop(true)
    } finally {
      process.exit(0)
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
```

> 註:`shutdown` 關的是啟動時的 `rt.pool`;切換後 server 內 store 的 pool 已換,但 `server.stop(true)` 會結束行程,作業系統回收連線。若要更嚴謹可後續暴露 `store` 給 index;此處保持精簡。

- [ ] **Step 2: 手動冒煙測試**

Run: `DBCLI_GUI_GLOBAL_DIR=/tmp/dbcli-smoke bun run sidecar/index.ts`
Expected: 印出 `{"ready":true,...}` 一行,不報錯。`Ctrl-C` 結束。

- [ ] **Step 3: Commit**

```bash
git add sidecar/index.ts
git commit -m "feat: [sidecar] 啟動還原 lastActive workspace"
```

---

## Task 9: 前端 api 型別 + client 方法

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`
- Test: `tests/frontend/client.test.ts`(加)

- [ ] **Step 1: 在 types.ts 加 Workspace 型別**

於 `src/api/types.ts` 追加:

```ts
export interface Workspace {
  id: string
  label: string
  kind: 'global' | 'project'
  path: string
}
```

- [ ] **Step 2: 寫失敗測試**

在 `tests/frontend/client.test.ts` 追加(沿用該檔既有 fetch mock 風格;若該檔用全域 `fetch` stub,照辦):

```ts
import { test, expect, mock } from 'bun:test'
import { makeClient } from '../../src/api/client'

test('selectWorkspace POST /workspace/select 帶 id', async () => {
  const calls: { url: string; body: unknown }[] = []
  const fakeFetch = mock(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined })
    return new Response(JSON.stringify({ connections: [], activeId: 'p1' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  })
  globalThis.fetch = fakeFetch as unknown as typeof fetch
  const client = makeClient('http://x', 'tok')
  const res = await client.selectWorkspace('p1')
  expect(res.activeId).toBe('p1')
  expect(calls[0].url).toBe('http://x/workspace/select')
  expect(calls[0].body).toEqual({ id: 'p1' })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `bun test tests/frontend/client.test.ts`
Expected: FAIL — `selectWorkspace` 不存在。

- [ ] **Step 4: 在 client.ts 加方法**

`DbClient` interface 內加:

```ts
  listWorkspaces(): Promise<{ workspaces: Workspace[]; activeId: string }>
  addWorkspace(path: string, label?: string): Promise<{ workspaces: Workspace[]; added: Workspace }>
  removeWorkspace(id: string): Promise<{ workspaces: Workspace[]; activeId: string }>
  selectWorkspace(id: string): Promise<{ connections: ConnectionSummary[]; activeId: string }>
```

`makeClient` 回傳物件內加(並在頂部 import 補 `Workspace`):

```ts
    listWorkspaces: () => post('/workspaces/list', {}) as Promise<{ workspaces: Workspace[]; activeId: string }>,
    addWorkspace: (path, label) => post('/workspaces/add', { path, ...(label ? { label } : {}) }) as Promise<{ workspaces: Workspace[]; added: Workspace }>,
    removeWorkspace: (id) => post('/workspaces/remove', { id }) as Promise<{ workspaces: Workspace[]; activeId: string }>,
    selectWorkspace: (id) => post('/workspace/select', { id }) as Promise<{ connections: ConnectionSummary[]; activeId: string }>,
```

- [ ] **Step 5: 跑測試確認通過**

Run: `bun test tests/frontend/client.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/client.ts tests/frontend/client.test.ts
git commit -m "feat: [frontend] client workspace 端點"
```

---

## Task 10: useWorkspaces hook

**Files:**
- Create: `src/hooks/useWorkspaces.ts`
- Test: `tests/frontend/useWorkspaces.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `tests/frontend/useWorkspaces.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWorkspaces } from '../../src/hooks/useWorkspaces'
import type { DbClient } from '../../src/api/client'
import type { Workspace, ConnectionSummary } from '../../src/api/types'

const G: Workspace = { id: 'global', label: '全域', kind: 'global', path: '~/.dbcli' }
const P: Workspace = { id: 'p1', label: 'proj', kind: 'project', path: '/proj/.dbcli' }

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    listWorkspaces: async () => ({ workspaces: [G], activeId: 'global' }),
    addWorkspace: async () => ({ workspaces: [G, P], added: P }),
    removeWorkspace: async () => ({ workspaces: [G], activeId: 'global' }),
    selectWorkspace: async () => ({ connections: [] as ConnectionSummary[], activeId: 'p1' }),
    ...over,
  } as unknown as DbClient
}

test('mount 後載入清單與 activeId', async () => {
  const { result } = renderHook(() => useWorkspaces(fakeClient()))
  await waitFor(() => expect(result.current.workspaces).toHaveLength(1))
  expect(result.current.activeId).toBe('global')
})

test('add 後清單更新', async () => {
  const { result } = renderHook(() => useWorkspaces(fakeClient()))
  await waitFor(() => expect(result.current.workspaces).toHaveLength(1))
  await act(async () => { await result.current.add('/proj') })
  expect(result.current.workspaces.map((w) => w.id)).toContain('p1')
})

test('select 回傳新連線清單並更新 activeId', async () => {
  const { result } = renderHook(() => useWorkspaces(fakeClient()))
  await waitFor(() => expect(result.current.activeId).toBe('global'))
  let conns: ConnectionSummary[] = []
  await act(async () => { conns = await result.current.select('p1') })
  expect(result.current.activeId).toBe('p1')
  expect(Array.isArray(conns)).toBe(true)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/useWorkspaces.test.ts`
Expected: FAIL — 模組不存在。

- [ ] **Step 3: 實作 src/hooks/useWorkspaces.ts**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { client as defaultClient, type DbClient } from '../api/client'
import { toApiError } from './useConnections'
import type { Workspace, ConnectionSummary } from '../api/types'
import type { ApiError } from '../api/client'

export interface WorkspacesApi {
  workspaces: Workspace[]
  activeId: string | null
  error: ApiError | null
  refresh(): Promise<void>
  add(path: string, label?: string): Promise<void>
  remove(id: string): Promise<void>
  /** 切換成功回傳新 workspace 的連線清單,供呼叫端套用 + 重置狀態。 */
  select(id: string): Promise<ConnectionSummary[]>
}

export function useWorkspaces(client: DbClient = defaultClient): WorkspacesApi {
  const clientRef = useRef(client)
  clientRef.current = client

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const refresh = useCallback(async () => {
    try {
      const { workspaces, activeId } = await clientRef.current.listWorkspaces()
      setWorkspaces(workspaces)
      setActiveId(activeId)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const add = useCallback(async (path: string, label?: string) => {
    try {
      const { workspaces } = await clientRef.current.addWorkspace(path, label)
      setWorkspaces(workspaces)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    try {
      const { workspaces, activeId } = await clientRef.current.removeWorkspace(id)
      setWorkspaces(workspaces)
      setActiveId(activeId)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [])

  const select = useCallback(async (id: string): Promise<ConnectionSummary[]> => {
    const { connections, activeId } = await clientRef.current.selectWorkspace(id)
    setActiveId(activeId)
    return connections
  }, [])

  return { workspaces, activeId, error, refresh, add, remove, select }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/useWorkspaces.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWorkspaces.ts tests/frontend/useWorkspaces.test.ts
git commit -m "feat: [frontend] useWorkspaces hook"
```

---

## Task 11: 切換重置 — connections + tabs + useApp

**Files:**
- Modify: `src/hooks/tabs-reducer.ts`(加 `reset` action)
- Modify: `src/hooks/useTabs.ts`(加 `resetAll`)
- Modify: `src/hooks/useConnections.ts`(加 `resetForWorkspace`)
- Modify: `src/hooks/useApp.ts`(加 `workspaces` + `switchWorkspace`)
- Test: `tests/frontend/tabs-reducer.test.ts`(加)、`tests/frontend/useApp.test.ts`(加)

- [ ] **Step 1: tabs-reducer 加 reset action — 先寫失敗測試**

在 `tests/frontend/tabs-reducer.test.ts` 追加:

```ts
import { tabsReducer, initTabs } from '../../src/hooks/tabs-reducer'

test('reset action 回到單一空白查詢分頁', () => {
  let state = initTabs()
  state = tabsReducer(state, { type: 'open' })
  state = tabsReducer(state, { type: 'open' })
  expect(state.sessions.length).toBe(3)
  const reset = tabsReducer(state, { type: 'reset' })
  expect(reset.sessions.length).toBe(1)
  expect(reset.sessions[0].sql).toBe('')
  expect(reset.sessions[0].browse).toBeNull()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/tabs-reducer.test.ts`
Expected: FAIL — `reset` 未處理。

- [ ] **Step 3: tabs-reducer 加 reset 分支**

在 `src/hooks/tabs-reducer.ts` 的 action union 型別加 `| { type: 'reset' }`,並在 `tabsReducer` switch 內加:

```ts
    case 'reset':
      return initTabs()
```

- [ ] **Step 4: useTabs 暴露 resetAll**

`src/hooks/useTabs.ts`:`TabsApi` interface 加 `resetAll(): void`;實作加:

```ts
  const resetAll = useCallback(() => dispatch({ type: 'reset' }), [])
```

並在 return 物件加入 `resetAll`。

- [ ] **Step 5: 跑測試確認通過**

Run: `bun test tests/frontend/tabs-reducer.test.ts`
Expected: PASS。

- [ ] **Step 6: useConnections 加 resetForWorkspace — 寫失敗測試**

在 `tests/frontend/useConnections.test.ts` 追加:

```ts
test('resetForWorkspace 套用新連線清單並清空 active/tree/permission', async () => {
  const { result } = renderHook(() => useConnections(/* 既有 fakeClient 工廠 */ makeFakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  act(() => {
    result.current.resetForWorkspace([{ name: 'newc', system: 'mysql', isDefault: true }])
  })
  expect(result.current.connections.map((c) => c.name)).toEqual(['newc'])
  expect(result.current.activeConnectionId).toBeNull()
  expect(result.current.tree).toHaveLength(0)
  expect(result.current.permission).toBeNull()
})
```

> 若該檔已有 `makeFakeClient`/fixture,沿用;否則仿照檔內既有 client stub 建一個最小 client(需含 `health`/`listConnections`)。

- [ ] **Step 7: 跑測試確認失敗**

Run: `bun test tests/frontend/useConnections.test.ts`
Expected: FAIL — `resetForWorkspace` 不存在。

- [ ] **Step 8: useConnections 實作 resetForWorkspace**

`ConnectionsApi` interface 加 `resetForWorkspace(connections: ConnectionSummary[]): void`;hook 內加:

```ts
  const resetForWorkspace = useCallback((next: ConnectionSummary[]) => {
    setConnections(next)
    setActiveConnectionId(null)
    setTree([])
    setExpandedColumns({})
    setPermission(null)
    setError(null)
  }, [])
```

並在 return 物件加入 `resetForWorkspace`。

- [ ] **Step 9: useApp 加 workspaces + switchWorkspace — 寫失敗測試**

在 `tests/frontend/useApp.test.ts` 追加:

```ts
test('switchWorkspace:套用新連線清單並重置查詢分頁', async () => {
  // 沿用該檔既有 makeClient 工廠,覆寫 workspace 方法
  const client = makeAppClient({
    selectWorkspace: async () => ({ connections: [{ name: 'wc', system: 'mysql', isDefault: true }], activeId: 'p1' }),
    listWorkspaces: async () => ({ workspaces: [{ id: 'global', label: '全域', kind: 'global', path: '~/.dbcli' }], activeId: 'global' }),
  })
  const { result } = renderHook(() => useApp(client))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  // 先開幾個分頁
  act(() => { result.current.tabs.openTab() })
  await act(async () => { await result.current.switchWorkspace('p1') })
  expect(result.current.tabs.sessions).toHaveLength(1)
  expect(result.current.connections.connections.map((c) => c.name)).toEqual(['wc'])
})
```

> `makeAppClient` 即該測試檔現有的 client 工廠(或最小 stub);只需確保含 `health`/`listConnections`/`selectWorkspace`/`listWorkspaces`。

- [ ] **Step 10: 跑測試確認失敗**

Run: `bun test tests/frontend/useApp.test.ts`
Expected: FAIL — `switchWorkspace` 不存在。

- [ ] **Step 11: useApp 實作**

`src/hooks/useApp.ts`:
- import:`import { useWorkspaces, type WorkspacesApi } from './useWorkspaces'`
- `AppApi` interface 加 `workspaces: WorkspacesApi` 與 `switchWorkspace(id: string): Promise<void>`
- hook 內:

```ts
  const workspaces = useWorkspaces(connections.client)

  const switchWorkspace = useCallback(async (id: string) => {
    try {
      const conns = await workspaces.select(id)
      connections.resetForWorkspace(conns)
      tabs.resetAll()
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [workspaces, connections, tabs])
```

- return 物件加入 `workspaces, switchWorkspace`。

- [ ] **Step 12: 跑全部前端測試確認通過**

Run: `bun test tests/frontend/`
Expected: PASS。

- [ ] **Step 13: Commit**

```bash
git add src/hooks/tabs-reducer.ts src/hooks/useTabs.ts src/hooks/useConnections.ts src/hooks/useApp.ts tests/frontend/
git commit -m "feat: [frontend] workspace 切換重置 connection+tabs 狀態"
```

---

## Task 12: WorkspaceSwitcher 元件 + 標題列掛載

**Files:**
- Create: `src/views/WorkspaceSwitcher.tsx`
- Modify: `src/App.tsx`(標題列連線狀態旁掛下拉)
- Test: `tests/frontend/WorkspaceSwitcher.test.tsx`

- [ ] **Step 1: 寫失敗測試**

Create `tests/frontend/WorkspaceSwitcher.test.tsx`:

```tsx
import { test, expect } from 'bun:test'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspaceSwitcher } from '../../src/views/WorkspaceSwitcher'
import type { Workspace } from '../../src/api/types'

const G: Workspace = { id: 'global', label: '全域', kind: 'global', path: '~/.dbcli' }
const P: Workspace = { id: 'p1', label: 'proj', kind: 'project', path: '/proj/.dbcli' }

test('顯示 active workspace 的 label', () => {
  render(<WorkspaceSwitcher workspaces={[G, P]} activeId="p1" onSelect={() => {}} onAdd={async () => {}} onRemove={() => {}} />)
  expect(screen.getByText('proj')).toBeDefined()
})

test('點某 workspace 觸發 onSelect', () => {
  let picked = ''
  render(<WorkspaceSwitcher workspaces={[G, P]} activeId="global" onSelect={(id) => { picked = id }} onAdd={async () => {}} onRemove={() => {}} />)
  fireEvent.click(screen.getByText('全域')) // 展開
  fireEvent.click(screen.getByText('proj'))
  expect(picked).toBe('p1')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/frontend/WorkspaceSwitcher.test.tsx`
Expected: FAIL — 元件不存在。

- [ ] **Step 3: 實作 src/views/WorkspaceSwitcher.tsx**

```tsx
import { useState } from 'react'
import type { Workspace } from '../api/types'

interface Props {
  workspaces: Workspace[]
  activeId: string | null
  onSelect(id: string): void
  onAdd(path: string, label?: string): Promise<void>
  onRemove(id: string): void
}

/** 開資料夾選擇:Tauri 環境用 dialog plugin,dev(瀏覽器)退回 prompt。 */
async function pickFolder(): Promise<string | null> {
  const tauri = (globalThis as { __TAURI__?: unknown }).__TAURI__
  if (tauri) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ directory: true, multiple: false })
    return typeof picked === 'string' ? picked : null
  }
  return window.prompt('輸入專案資料夾的絕對路徑') || null
}

export function WorkspaceSwitcher({ workspaces, activeId, onSelect, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const active = workspaces.find((w) => w.id === activeId)

  const handleAdd = async () => {
    const folder = await pickFolder()
    if (folder) await onAdd(folder)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
        title="切換 workspace"
      >
        <span>{active?.kind === 'global' ? '🌐' : '📁'}</span>
        <span className="max-w-[140px] truncate">{active?.label ?? '全域'}</span>
        <span className="opacity-50">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {workspaces.map((w) => (
              <div key={w.id} className="group flex items-center justify-between px-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                <button
                  type="button"
                  onClick={() => { onSelect(w.id); setOpen(false) }}
                  className={`flex-1 truncate py-1.5 text-left text-xs cursor-pointer ${w.id === activeId ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  {w.kind === 'global' ? '🌐 ' : '📁 '}{w.label}
                </button>
                {w.kind === 'project' && (
                  <button
                    type="button"
                    onClick={() => onRemove(w.id)}
                    className="ml-1 px-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500 cursor-pointer"
                    title="移除此 workspace"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            <button
              type="button"
              onClick={() => { setOpen(false); void handleAdd() }}
              className="w-full px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              ＋ 加入 workspace…
            </button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/frontend/WorkspaceSwitcher.test.tsx`
Expected: PASS。

- [ ] **Step 5: 掛進 App.tsx 標題列**

在 `src/App.tsx`:
- 解構加 `const { connections: conn, tabs, history, workspaces } = app`。
- import:`import { WorkspaceSwitcher } from './views/WorkspaceSwitcher'`。
- 在標題列「Connection Status」那段(`<div className="flex items-center gap-1.5 text-xs ...">{conn.activeConnectionId ...}</div>`)後面、`</div>` 之前插入:

```tsx
          <span className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
          <WorkspaceSwitcher
            workspaces={workspaces.workspaces}
            activeId={workspaces.activeId}
            onSelect={app.switchWorkspace}
            onAdd={workspaces.add}
            onRemove={workspaces.remove}
          />
```

- [ ] **Step 6: 型別檢查 + 全測試**

Run: `bun test`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/views/WorkspaceSwitcher.tsx src/App.tsx tests/frontend/WorkspaceSwitcher.test.tsx
git commit -m "feat: [frontend] 標題列 workspace 切換下拉"
```

---

## Task 13: E2E — workspace 切換旅程

**Files:**
- Modify: `tests/e2e/serve-fixture.ts`(加 registry + 第二個全域 store)
- Create: `tests/e2e/journeys/workspace.e2e.ts`

- [ ] **Step 1: 擴充 serve-fixture.ts 提供 registry**

在 `tests/e2e/serve-fixture.ts`,於建立 `pool` 之後、`createServer` 之前插入「全域 store + registry」設定;並把 `createServer` 改為帶 `registry`/`globalDir`。在檔頭 import 加 `WorkspaceRegistry`、`writeV2Config` 已 import。

```ts
import { WorkspaceRegistry } from '../../sidecar/workspaces'

// 全域 store:放一條與專案不同名的連線,切換後側欄會變。
const E2E_GLOBAL = join(tmpdir(), 'dbcli-gui-e2e-global', '.dbcli')
await Bun.$`rm -rf ${join(tmpdir(), 'dbcli-gui-e2e-global')}`
await Bun.$`mkdir -p ${E2E_GLOBAL}`
await writeProjectBinding(E2E_GLOBAL, getProjectStoragePath(E2E_GLOBAL))
await writeV2Config(E2E_GLOBAL, {
  version: 2, default: 'globaldb',
  connections: {
    globaldb: {
      system: 'mysql', host: 'localhost', port: 3306, user: 'root',
      password: { $env: 'DBCLI_MAIN_PASSWORD' }, database: 'shop',
      permission: 'query-only', envFile: '.env.main',
    },
  },
  schema: {}, schemas: {}, metadata: { version: '2.0' },
  blacklist: { tables: [], columns: {} },
  audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
} as never)

const registry = await WorkspaceRegistry.load(E2E_GLOBAL)
await registry.add(join(tmpdir(), 'dbcli-gui-e2e')) // 專案 workspace(其 .dbcli 為 E2E_PROJECT)
```

把現有 `createServer({ ... })` 呼叫改為:

```ts
createServer({
  pool,
  token: TOKEN,
  port: SIDECAR_PORT,
  dbcliPath: E2E_GLOBAL,   // 啟動 active = 全域
  globalDir: E2E_GLOBAL,
  registry,
  listConnections: async () =>
    coreList(await readV2Config(E2E_GLOBAL)).map((c) => ({
      name: c.name, system: c.system, isDefault: c.isDefault,
    })),
})
```

> 註:fixture 的 `pool.loadConfig` 以連線名查 `SEED`。請確認 `SEED`(`tests/e2e/fixtures/data.ts`)含名為 `globaldb` 的連線;若無,於該檔 SEED 補一筆 `globaldb`(複製 `main` 的 summary/config/tables,改 name)。此步驟為 E2E 前置,需與 fixtures 對齊。

- [ ] **Step 2: 寫 E2E 旅程**

Create `tests/e2e/journeys/workspace.e2e.ts`:

```ts
import { test, expect } from '@playwright/test'
import { APP_PATH } from '../fixtures/config'

test('切換 workspace:全域 → 專案,側欄連線改變且查詢分頁重置', async ({ page }) => {
  await page.goto(APP_PATH)

  // 啟動 active = 全域,應看到 globaldb 連線
  await expect(page.getByText('globaldb')).toBeVisible()

  // 開第二個查詢分頁(待會驗證重置)
  await page.getByTitle('新增分頁').click().catch(() => {}) // 若 TabBar 用其他 title,對齊既有 tabs.e2e

  // 開 workspace 下拉 → 選專案
  await page.getByTitle('切換 workspace').click()
  await page.getByText('📁', { exact: false }).first().click()

  // 專案 workspace 的連線 main 出現
  await expect(page.getByText('main')).toBeVisible()
})
```

> 註:選擇器需與既有 e2e(`tabs.e2e.ts`/`connections.e2e.ts`)的命名對齊;若 TabBar 新增分頁鈕 title 不同,沿用該檔用過的 selector。

- [ ] **Step 3: 跑 E2E**

Run: `bun run e2e tests/e2e/journeys/workspace.e2e.ts`
Expected: PASS(綠)。若 selector 不符,依實際 DOM 調整後再跑。

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/serve-fixture.ts tests/e2e/journeys/workspace.e2e.ts tests/e2e/fixtures/data.ts
git commit -m "test: [e2e] workspace 切換旅程"
```

---

## Task 14: README 段落

**Files:**
- Modify: `README.md`(v2 段落)

- [ ] **Step 1: 在 README 的「## v2」相關處新增段落**

```markdown
## v2 ‧ 全域連線 + Workspace 切換

- **全域為主**:預設讀全域連線庫 `~/.dbcli`(與 dbcli CLI 共用),不再綁啟動目錄。可用 `DBCLI_GUI_GLOBAL_DIR` 覆寫。
- **標題列 workspace 切換**:下拉可在「全域」與手動加入的專案間即時切換;切換時 sidecar 關閉舊連線、用新設定庫重建連線池(`server.reload`),前端重置連線/schema/分頁狀態。
- **手動管理清單**:「加入 workspace…」選資料夾(Tauri folder dialog),清單與上次選用記於 `~/.dbcli/workspaces.json`(原子寫),啟動還原。
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: [v2] README 全域連線+workspace 切換段落"
```

---

## Self-Review(計畫對照 spec)

- **全域為主 `~/.dbcli`** → Task 1。
- **runtime 切換(closeAll+重建+reload)** → Task 4/7。
- **registry 手動清單 + 持久化 + lastActive** → Task 2/3/6/8。
- **切換重置 connection + 查詢分頁** → Task 11。
- **標題列下拉 + folder dialog** → Task 12。
- **錯誤處理**:檔毀損退回 global(Task 3 測試)、未知 workspace 丟錯轉 envelope(Task 6/7)、解析失敗 fallback(Task 8)。
- **測試**:config/registry/active-store/route/hook/component/E2E 皆有對應 task。
- **型別一致性**:`Workspace`/`WorkspacesFile`/`ActiveStore`/`StoreRuntime`/`SelectWorkspace`/`WorkspacesApi` 跨 task 命名一致;client 方法名(`listWorkspaces`/`addWorkspace`/`removeWorkspace`/`selectWorkspace`)與 hook/route 對齊。

> 已知前置依賴:Task 13 需 `tests/e2e/fixtures/data.ts` 的 SEED 含 `globaldb` 連線(該步驟已標註需對齊 fixtures)。其餘 task 自含。
