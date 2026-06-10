import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter, TableSchema, ExecutionResult } from '@carllee1983/dbcli/core'

const fakeConfig = {
  connection: { system: 'mysql' },
  permission: 'read-write',
  blacklist: { tables: ['secrets'], columns: {} },
} as unknown as DbcliConfig

const USERS_SCHEMA: TableSchema = {
  name: 'users',
  columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }],
  primaryKey: ['id'],
  foreignKeys: [{ name: 'fk_org', columns: ['org_id'], refTable: 'orgs', refColumns: ['id'] }],
}

// Route table-detail dispatches by SQL shape; the fake answers each query kind.
function fakeAdapter(): DatabaseAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    listTables: async () => [],
    getTableSchema: async (name: string) => (name === 'users' ? USERS_SCHEMA : { name, columns: [] }),
    execute: async <T>(sql: string): Promise<ExecutionResult<T>> => {
      const rows = (
        sql.includes('TRIGGERS')
          ? [{ name: 'trg_audit', timing: 'AFTER', event: 'INSERT', statement: 'BEGIN END' }]
          : sql.includes('KEY_COLUMN_USAGE')
            ? [{ fromTable: 'orders', fromColumn: 'user_id', toColumn: 'id', constraintName: 'fk_o' }]
            : sql.startsWith('SHOW CREATE TABLE')
              ? [{ Table: 'users', 'Create Table': 'CREATE TABLE `users` (...)' }]
              : sql.includes('information_schema.TABLES')
                ? [{ engine: 'InnoDB', rowCount: 42, sizeBytes: 16384, collation: 'utf8mb4_general_ci', createdAt: '2024-01-01' }]
                : []
      ) as unknown as T[]
      return { rows, affectedRows: 0 } as ExecutionResult<T>
    },
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

test('triggers: NOT_OPEN when connection not opened', async () => {
  const s = start()
  const res = await post(s, '/schema/triggers', { connectionId: 'x', table: 'users' })
  expect(res.status).toBe(409)
})

test('triggers: returns the shaped list', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/triggers', { connectionId: 'main', table: 'users' })
  expect(res.status).toBe(200)
  const body = await res.json() as { triggers: Array<{ name: string }> }
  expect(body.triggers[0]!.name).toBe('trg_audit')
})

test('triggers: blacklisted table → 403 BLACKLISTED', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/triggers', { connectionId: 'main', table: 'secrets' })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('BLACKLISTED')
})

test('info: returns engine/rowCount/sizeBytes/createSql', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/info', { connectionId: 'main', table: 'users' })
  expect(res.status).toBe(200)
  const body = await res.json() as { info: { engine: string; rowCount: number; createSql: string } }
  expect(body.info.engine).toBe('InnoDB')
  expect(body.info.rowCount).toBe(42)
  expect(body.info.createSql).toContain('CREATE TABLE')
})

test('relations: returns forward (from schema FK) + reverse (from query)', async () => {
  const s = start()
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/schema/relations', { connectionId: 'main', table: 'users' })
  expect(res.status).toBe(200)
  const body = await res.json() as { relations: { forward: unknown[]; reverse: Array<{ fromTable: string }> } }
  expect(body.relations.forward).toHaveLength(1)
  expect(body.relations.reverse[0]!.fromTable).toBe('orders')
})

test('triggers without token → 401', async () => {
  const s = start()
  const res = await fetch(`http://localhost:${s.port}/schema/triggers`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectionId: 'main', table: 'users' }),
  })
  expect(res.status).toBe(401)
})
