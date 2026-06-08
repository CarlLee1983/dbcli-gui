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

export interface ServerDeps {
  pool: ConnectionPool
  token: string
  port: number
  listConnections?: ConnectionLister
}

const guard = (token: string, h: Handler): Handler => (req) =>
  checkBearer(req, token) ? h(req) : json({ error: { code: 'UNAUTHORIZED', message: 'bad token' } }, 401)

/** Build (and start) the sidecar HTTP server. */
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
