import { test, expect, afterEach } from 'bun:test'
import { createServer } from '../../sidecar/server'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DbcliConfig, DatabaseAdapter } from '@carllee1983/dbcli/core'

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig
const fakeAdapter = { connect: async () => {}, disconnect: async () => {}, execute: async () => ({ rows: [] }) } as unknown as DatabaseAdapter

function makeServer() {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter })
  return createServer({ pool, token: 'test', port: 0 })
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
