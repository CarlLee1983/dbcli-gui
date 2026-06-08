import type { Server } from 'bun'
// Server<WebSocketData> — no WebSocket in this server, so use unknown as the data type.
import pkg from '../package.json'
import type { ConnectionPool } from './connection-pool'
import { checkBearer } from './auth'
import { json } from './http'
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

type Handler = (req: Request) => Response | Promise<Response>
const guard = (token: string, h: Handler): Handler => (req) =>
  checkBearer(req, token) ? h(req) : json({ error: { code: 'UNAUTHORIZED', message: 'bad token' } }, 401)

/** Build (and start) the sidecar HTTP server. */
export function createServer(deps: ServerDeps): Server<unknown> {
  const conn = makeConnectionHandlers(deps.pool)
  const schema = makeSchemaHandlers(deps.pool)
  return Bun.serve({
    port: deps.port,
    routes: {
      '/health': () => json({ ok: true, version: pkg.version }),
      '/connections/open': { POST: guard(deps.token, conn.open) },
      '/connections/close': { POST: guard(deps.token, conn.close) },
      '/connections/list': { POST: guard(deps.token, makeListHandler(deps.listConnections)) },
      '/query': { POST: guard(deps.token, makeQueryHandler(deps.pool)) },
      '/schema/tree': { POST: guard(deps.token, schema.tree) },
      '/schema/table': { POST: guard(deps.token, schema.table) },
      '/export': { POST: guard(deps.token, makeExportHandler(deps.pool)) },
    },
    fetch: () => json({ error: { code: 'NOT_FOUND', message: 'No such route' } }, 404),
  })
}
