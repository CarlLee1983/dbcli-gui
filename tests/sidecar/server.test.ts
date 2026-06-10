import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'
import { WorkspaceRegistry } from '../../sidecar/workspaces'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig
const fakeAdapter = { connect: async () => {}, disconnect: async () => {}, execute: async () => ({ rows: [] }) } as unknown as DatabaseAdapter

function makeServer() {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter })
  return createServer({ pool, token: 'test', port: 0, dbcliPath: '/tmp/dbcli-gui-unused' })
}

let server: ReturnType<typeof makeServer> | undefined
afterEach(async () => { await server?.stop(true) })

test('GET /health returns ok without auth', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/health`)
  expect(res.status).toBe(200)
  const body = await res.json() as { ok: boolean; version: string }
  expect(body.ok).toBe(true)
  expect(typeof body.version).toBe('string')
  expect(res.headers.get('content-type')).toBe('application/json')
})

test('unknown route returns a JSON 404 envelope', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/nope`, { headers: { authorization: 'Bearer test' } })
  expect(res.status).toBe(404)
  const body = await res.json() as { error: { code: string } }
  expect(body.error.code).toBe('NOT_FOUND')
})

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
