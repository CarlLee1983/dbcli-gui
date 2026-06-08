import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig
const fakeAdapter = { connect: async () => {}, disconnect: async () => {}, execute: async () => ({ rows: [] }) } as unknown as DatabaseAdapter

let server: ReturnType<typeof createServer> | undefined
afterEach(async () => { await server?.stop(true) })

function start(listConnections?: () => Promise<Array<{ name: string; system: string; isDefault: boolean }>>) {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter })
  server = createServer({ pool, token: 'test', port: 0, listConnections })
  return server
}
const post = (s: ReturnType<typeof createServer>, path: string, body: unknown, auth = 'Bearer test') =>
  fetch(`http://localhost:${s.port}${path}`, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('POST /connections/list without auth returns 401', async () => {
  const s = start(async () => [])
  const res = await post(s, '/connections/list', {}, 'Bearer wrong')
  expect(res.status).toBe(401)
})

test('POST /connections/list returns connections without secrets', async () => {
  const s = start(async () => [
    { name: 'prod', system: 'postgresql', isDefault: true },
    { name: 'staging', system: 'mysql', isDefault: false },
  ])
  const res = await post(s, '/connections/list', {})
  expect(res.status).toBe(200)
  const body = await res.json() as { connections: Array<{ name: string; system: string; isDefault: boolean }> }
  expect(body.connections).toEqual([
    { name: 'prod', system: 'postgresql', isDefault: true },
    { name: 'staging', system: 'mysql', isDefault: false },
  ])
  expect(JSON.stringify(body)).not.toContain('password')
})

test('POST /connections/list returns 500 when the config cannot be read', async () => {
  const s = start(async () => { throw new Error('no .dbcli here') })
  const res = await post(s, '/connections/list', {})
  expect(res.status).toBe(500)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('INTERNAL')
})

test('POST /connections/list returns 501 when no lister is configured', async () => {
  const s = start(undefined)
  const res = await post(s, '/connections/list', {})
  expect(res.status).toBe(501)
  expect((await res.json() as { error: { code: string } }).error.code).toBe('NOT_CONFIGURED')
})
