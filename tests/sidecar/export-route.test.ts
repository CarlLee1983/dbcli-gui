import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { toCsv } from '../../sidecar/routes/export'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig

function fakeAdapter(rows: Array<Record<string, unknown>>): DatabaseAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
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
const post = (s: ReturnType<typeof createServer>, path: string, body: unknown) =>
  fetch(`http://localhost:${s.port}${path}`, { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('export csv returns a header row, quoting, and attachment headers', async () => {
  const s = start([
    { id: 1, note: 'plain' },
    { id: 2, note: 'has, comma' },
    { id: 3, note: 'has "quote"' },
  ])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/export', { connectionId: 'main', sql: 'SELECT * FROM t', format: 'csv' })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/csv')
  expect(res.headers.get('content-disposition')).toContain('attachment')
  const text = await res.text()
  expect(text).toBe('id,note\n1,plain\n2,"has, comma"\n3,"has ""quote"""')
})

test('export json returns a JSON array with attachment headers', async () => {
  const s = start([{ id: 1 }, { id: 2 }])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/export', { connectionId: 'main', sql: 'SELECT * FROM t', format: 'json' })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('application/json')
  expect(res.headers.get('content-disposition')).toContain('attachment')
  expect(await res.json()).toEqual([{ id: 1 }, { id: 2 }])
})

test('export on an unopened connection returns 409', async () => {
  const s = start([])
  const res = await post(s, '/export', { connectionId: 'missing', sql: 'SELECT 1', format: 'csv' })
  expect(res.status).toBe(409)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('NOT_OPEN')
})

test('export rejects a write statement (forced query-only)', async () => {
  const s = start([])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/export', { connectionId: 'main', sql: 'DELETE FROM users', format: 'csv' })
  expect(res.status).toBe(403)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('PERMISSION')
})

test('export with an invalid format returns 400', async () => {
  const s = start([])
  await post(s, '/connections/open', { connectionId: 'main' })
  const res = await post(s, '/export', { connectionId: 'main', sql: 'SELECT 1', format: 'xml' })
  expect(res.status).toBe(400)
})

test('toCsv returns empty string when there are no columns', () => {
  expect(toCsv([], [])).toBe('')
  expect(toCsv([], [{ id: 1 }])).toBe('')
})

test('export without auth returns 401', async () => {
  const s = start([])
  const res = await fetch(`http://localhost:${s.port}/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectionId: 'main', sql: 'SELECT 1', format: 'csv' }),
  })
  expect(res.status).toBe(401)
})
