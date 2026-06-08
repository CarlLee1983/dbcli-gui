import type { Server } from 'bun'
// Server<WebSocketData> — no WebSocket in this server, so use unknown as the data type.
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
export function createServer(deps: ServerDeps): Server<unknown> {
  return Bun.serve({
    port: deps.port,
    routes: {
      '/health': () => json({ ok: true, version: pkg.version }),
    },
    fetch: () => json({ error: { code: 'NOT_FOUND', message: 'No such route' } }, 404),
  })
}
