import type { Server } from 'bun'
// Server<WebSocketData> — no WebSocket in this server, so use unknown as the data type.
import pkg from '../package.json'
import type { ConnectionPool } from './connection-pool'
import { checkBearer } from './auth'
import { json } from './http'
import { makeConnectionHandlers } from './routes/connections'
import { makeQueryHandler } from './routes/query'

export interface ServerDeps {
  pool: ConnectionPool
  token: string
  port: number
}

type Handler = (req: Request) => Response | Promise<Response>
const guard = (token: string, h: Handler): Handler => (req) =>
  checkBearer(req, token) ? h(req) : json({ error: { code: 'UNAUTHORIZED', message: 'bad token' } }, 401)

/** Build (and start) the sidecar HTTP server. */
export function createServer(deps: ServerDeps): Server<unknown> {
  const conn = makeConnectionHandlers(deps.pool)
  return Bun.serve({
    port: deps.port,
    routes: {
      '/health': () => json({ ok: true, version: pkg.version }),
      '/connections/open': { POST: guard(deps.token, conn.open) },
      '/connections/close': { POST: guard(deps.token, conn.close) },
      '/query': { POST: guard(deps.token, makeQueryHandler(deps.pool)) },
    },
    fetch: () => json({ error: { code: 'NOT_FOUND', message: 'No such route' } }, 404),
  })
}
