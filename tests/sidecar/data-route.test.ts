import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

const SCHEMA = {
  name: 'users',
  columns: [
    { name: 'id', type: 'int', nullable: false, primaryKey: true },
    { name: 'name', type: 'text', nullable: true },
    { name: 'ssn', type: 'text', nullable: true },
  ],
  primaryKey: ['id'],
}

function cfg(over: Partial<{ permission: string; blacklist: unknown }> = {}): DbcliConfig {
  return {
    connection: { system: 'postgresql' },
    permission: over.permission ?? 'data-admin',
    blacklist: over.blacklist ?? { tables: [], columns: {} },
  } as unknown as DbcliConfig
}

function recordingAdapter(affected = 1): { adapter: DatabaseAdapter; calls: string[] } {
  const calls: string[] = []
  const adapter = {
    connect: async () => {},
    disconnect: async () => {},
    execute: async (sql: string) => { calls.push(sql.split(' ')[0] ?? sql); return { rows: [], affectedRows: affected } },
    getTableSchema: async () => SCHEMA,
  } as unknown as DatabaseAdapter
  return { adapter, calls }
}

let server: ReturnType<typeof createServer> | undefined
afterEach(async () => { await server?.stop(true) })

function start(config: DbcliConfig, rec = recordingAdapter()) {
  const pool = new ConnectionPool({ loadConfig: async () => config, openAdapter: () => rec.adapter })
  server = createServer({ pool, token: 'test', port: 0, dbcliPath: '/tmp/dbcli-gui-unused' })
  return { server, calls: rec.calls }
}
const post = (s: ReturnType<typeof createServer>, path: string, body: unknown) =>
  fetch(`http://localhost:${s.port}${path}`, { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('batch update+insert+delete commits and reports counts', async () => {
  const { server: s, calls } = start(cfg())
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', {
    connectionId: 'main', table: 'users',
    ops: { updates: [{ pk: { id: 1 }, set: { name: 'x' } }], inserts: [{ values: { name: 'y' } }], deletes: [{ pk: { id: 2 } }] },
  })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, applied: { updated: 1, inserted: 1, deleted: 1 } })
  expect(calls).toContain('BEGIN')
  expect(calls).toContain('COMMIT')
})

test('query-only permission rejects writes with 403 PERMISSION', async () => {
  const { server: s } = start(cfg({ permission: 'query-only' }))
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', { connectionId: 'main', table: 'users', ops: { updates: [{ pk: { id: 1 }, set: { name: 'x' } }] } })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('PERMISSION')
})

test('read-write permission rejects deletes with 403 PERMISSION', async () => {
  const { server: s } = start(cfg({ permission: 'read-write' }))
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', { connectionId: 'main', table: 'users', ops: { deletes: [{ pk: { id: 1 } }] } })
  expect(res.status).toBe(403)
})

test('blacklisted table is rejected', async () => {
  const { server: s } = start(cfg({ blacklist: { tables: ['users'], columns: {} } }))
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', { connectionId: 'main', table: 'users', ops: { inserts: [{ values: { name: 'y' } }] } })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('BLACKLISTED')
})

test('writing a blacklisted column is rejected', async () => {
  const { server: s } = start(cfg({ blacklist: { tables: [], columns: { users: ['ssn'] } } }))
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', { connectionId: 'main', table: 'users', ops: { updates: [{ pk: { id: 1 }, set: { ssn: '123' } }] } })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('BLACKLISTED')
})

test('affectedRows !== 1 on update rolls back with 409 CONFLICT', async () => {
  const { server: s, calls } = start(cfg(), recordingAdapter(0))
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/data/mutate', { connectionId: 'main', table: 'users', ops: { updates: [{ pk: { id: 99 }, set: { name: 'x' } }] } })
  expect(res.status).toBe(409)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('CONFLICT')
  expect(calls).toContain('ROLLBACK')
})

test('mutate on unopened connection returns 409 NOT_OPEN', async () => {
  const { server: s } = start(cfg())
  const res = await post(s, '/data/mutate', { connectionId: 'missing', table: 'users', ops: { inserts: [{ values: { name: 'y' } }] } })
  expect(res.status).toBe(409)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('NOT_OPEN')
})
