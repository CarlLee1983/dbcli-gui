import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter, TableSchema } from '@carllee1983/dbcli/core'

// Config with a blacklist: table "secrets" is hidden; column "password" on "users" is stripped.
const fakeConfig = {
  connection: { system: 'postgresql' },
  permission: 'read-write',
  blacklist: { tables: ['secrets'], columns: { users: ['password'] } },
} as unknown as DbcliConfig

const TABLES: TableSchema[] = [
  { name: 'users', columns: [], columnCount: 3, tableType: 'table', rowCount: 10 },
  { name: 'secrets', columns: [], columnCount: 2, tableType: 'table' },
  { name: 'active_users', columns: [], columnCount: 1, tableType: 'view' },
]

const USERS_SCHEMA: TableSchema = {
  name: 'users',
  columns: [
    { name: 'id', type: 'int', nullable: false, primaryKey: true },
    { name: 'email', type: 'text', nullable: false },
    { name: 'password', type: 'text', nullable: false },
  ],
  primaryKey: ['id'],
}

function fakeAdapter(): DatabaseAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    execute: async () => ({ rows: [] }),
    listTables: async () => TABLES,
    getTableSchema: async (name: string) => (name === 'users' ? USERS_SCHEMA : { name, columns: [] }),
  } as unknown as DatabaseAdapter
}

let server: ReturnType<typeof createServer> | undefined
afterEach(async () => { await server?.stop(true) })

function start() {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter() })
  server = createServer({ pool, token: 'test', port: 0, dbcliPath: '/tmp/dbcli-gui-unused' })
  return server
}
const post = (s: ReturnType<typeof createServer>, path: string, body: unknown) =>
  fetch(`http://localhost:${s.port}${path}`, { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('POST /schema/tree on an unopened connection returns 409', async () => {
  const s = start()
  const res = await post(s, '/schema/tree', { connectionId: 'missing' })
  expect(res.status).toBe(409)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('NOT_OPEN')
})

test('POST /schema/tree lists tables, hides blacklisted ones, and maps type', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/tree', { connectionId: 'main' })
  expect(res.status).toBe(200)
  const body = await res.json() as { tables: Array<{ name: string; type: string; columnCount?: number; rowCount?: number | null }> }
  const names = body.tables.map((t) => t.name)
  expect(names).toEqual(['users', 'active_users']) // "secrets" hidden
  const view = body.tables.find((t) => t.name === 'active_users')
  expect(view!.type).toBe('view')
  const users = body.tables.find((t) => t.name === 'users')
  expect(users!.type).toBe('table')
  expect(users!.columnCount).toBe(3)
  expect(users!.rowCount).toBe(10)
})

test('POST /schema/table strips blacklisted columns', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/table', { connectionId: 'main', table: 'users' })
  expect(res.status).toBe(200)
  const body = await res.json() as { table: { columns: Array<{ name: string }> } }
  const cols = body.table.columns.map((c) => c.name)
  expect(cols).toEqual(['id', 'email']) // "password" stripped
})

test('POST /schema/table on a blacklisted table returns 403', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/table', { connectionId: 'main', table: 'secrets' })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('BLACKLISTED')
})

test('POST /schema/table with missing table returns 400', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/table', { connectionId: 'main' })
  expect(res.status).toBe(400)
})

test('POST /schema/tree without token returns 401', async () => {
  const s = start()
  const res = await fetch(`http://localhost:${s.port}/schema/tree`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectionId: 'main' }),
  })
  expect(res.status).toBe(401)
})
