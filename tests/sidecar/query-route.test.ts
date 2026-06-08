import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

// Minimal config with no blacklist; permission in config is read-write but the route forces query-only.
const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig

// Config with a blacklisted table to test blacklist enforcement end-to-end.
const blacklistedConfig = {
  connection: { system: 'postgresql' },
  permission: 'read-write',
  blacklist: { tables: ['secret_table'], columns: {} },
} as unknown as DbcliConfig

function fakeAdapter(rows: Array<Record<string, unknown>>): DatabaseAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    // QueryExecutor calls adapter.execute(sql) for SELECTs; return canned rows.
    execute: async () => ({ rows }),
  } as unknown as DatabaseAdapter
}

let server: ReturnType<typeof createServer> | undefined
afterEach(async () => { await server?.stop(true) })

function start(rows: Array<Record<string, unknown>>) {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter(rows) })
  server = createServer({ pool, token: 'test', port: 0 })
  return server
}

function startWith(config: DbcliConfig, rows: Array<Record<string, unknown>>) {
  const pool = new ConnectionPool({ loadConfig: async () => config, openAdapter: () => fakeAdapter(rows) })
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
  const body = await res.json() as { rows: unknown[] }
  expect(Array.isArray(body.rows)).toBe(true)
  expect(body.rows.length).toBe(2)
})

test('query on an unopened connection returns 409', async () => {
  const s = start([])
  const res = await post(s, '/query', { connectionId: 'missing', sql: 'SELECT 1' })
  expect(res.status).toBe(409)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('NOT_OPEN')
})

test('write statement is rejected by forced query-only permission', async () => {
  const s = start([])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/query', { connectionId: 'main', sql: 'DELETE FROM users' })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('PERMISSION')
})

test('invalid body returns 400', async () => {
  const s = start([])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/query', { connectionId: 'main' })
  expect(res.status).toBe(400)
})

test('SELECT on a blacklisted table returns 403 BLACKLISTED', async () => {
  // Proves that BlacklistValidator is enforced end-to-end through HTTP:
  // QueryExecutor.execute calls extractTableName(sql) → checkTableBlacklist →
  // throws BlacklistError → toErrorBody maps it to BLACKLISTED → route returns 403.
  const s = startWith(blacklistedConfig, [])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/query', { connectionId: 'main', sql: 'SELECT * FROM secret_table' })
  expect(res.status).toBe(403)
  const body = await res.json() as { error: { code: string } }
  expect(body.error.code).toBe('BLACKLISTED')
})
