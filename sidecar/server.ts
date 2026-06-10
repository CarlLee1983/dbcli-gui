import type { Server } from 'bun'
// Server<WebSocketData> — no WebSocket in this server, so use unknown as the data type.
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
  // lister 刻意保留 undefined(未提供 listConnections 時),/connections/list 回 501。
  const store: ActiveStore = {
    id: deps.registry?.activeId() ?? 'global',
    dbcliPath: deps.dbcliPath,
    pool: deps.pool,
    lister: deps.listConnections,
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
    return store.lister().catch((e) => {
      // 新加入但尚未設定的 workspace:回空清單;其餘錯誤照常往上拋,讓路由轉成 error envelope。
      if (e instanceof Error && e.name === 'ConfigError') return []
      throw e
    })
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
