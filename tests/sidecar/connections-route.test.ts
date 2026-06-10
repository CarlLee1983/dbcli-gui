import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import { ConnectionError, type DbcliConfig, type DatabaseAdapter } from '@carllee1983/dbcli/core'

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig
function fakeAdapter() { return { connect: async () => {}, disconnect: async () => {}, execute: async () => ({ rows: [] }) } as unknown as DatabaseAdapter }

let server: ReturnType<typeof createServer> | undefined
afterEach(async () => { await server?.stop(true) })

function start() {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter() })
  server = createServer({ pool, token: 'test', port: 0, dbcliPath: '/tmp/dbcli-gui-unused' })
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
  expect((await res.json() as { ok: boolean }).ok).toBe(true)
})

test('POST /connections/open with invalid body returns 400', async () => {
  const s = start()
  const res = await post(s, '/connections/open', {})
  expect(res.status).toBe(400)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('BAD_REQUEST')
})

test('POST /connections/close closes an open connection', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/connections/close', { connectionId: 'main' })
  expect(res.status).toBe(200)
})

test('POST /connections/close without auth returns 401', async () => {
  const s = start()
  const res = await post(s, '/connections/close', { connectionId: 'main' }, 'Bearer wrong')
  expect(res.status).toBe(401)
})

test('POST /connections/open maps a ConfigError (unknown id / missing config) to 501 NOT_CONFIGURED', async () => {
  const pool = new ConnectionPool({
    loadConfig: async () => { const e = new Error("連線 'nope' 不存在"); e.name = 'ConfigError'; throw e },
    openAdapter: () => fakeAdapter(),
  })
  server = createServer({ pool, token: 'test', port: 0, dbcliPath: '/tmp/dbcli-gui-unused' })
  const res = await post(server, '/connections/open', { connectionId: 'nope' })
  expect(res.status).toBe(501)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('NOT_CONFIGURED')
})

test('POST /connections/open maps a ConnectionError to 502 CONNECTION', async () => {
  const downAdapter = {
    connect: async () => { throw new ConnectionError('ECONNREFUSED', 'db is down', []) },
    disconnect: async () => {},
    execute: async () => ({ rows: [] }),
  } as unknown as DatabaseAdapter
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => downAdapter })
  server = createServer({ pool, token: 'test', port: 0, dbcliPath: '/tmp/dbcli-gui-unused' })
  const res = await post(server, '/connections/open', { connectionId: 'main' })
  expect(res.status).toBe(502)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('CONNECTION')
})

import { test as openTest, expect as openExpect } from 'bun:test'
import { createServer as mkServer } from '../../sidecar/server'
import { ConnectionPool as Pool } from '../../sidecar/connection-pool'
import type { DbcliConfig as Cfg } from '@carllee1983/dbcli/core'

openTest('open returns the connection permission', async () => {
  const config = { connection: { system: 'mysql' }, permission: 'read-write' } as unknown as Cfg
  const pool = new Pool({ loadConfig: async () => config, openAdapter: () => ({ connect: async () => {}, disconnect: async () => {} }) as never })
  const s = mkServer({ pool, token: 't', port: 0, dbcliPath: '/tmp/dbcli-gui-unused' })
  try {
    const res = await fetch(`http://localhost:${s.port}/connections/open`, {
      method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ connectionId: 'main' }),
    })
    openExpect(res.status).toBe(200)
    openExpect(await res.json()).toEqual({ ok: true, system: 'mysql', permission: 'read-write' })
  } finally {
    await s.stop(true)
  }
})
