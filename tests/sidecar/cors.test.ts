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

test('OPTIONS preflight returns 204 with CORS headers and no token needed', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/query`, { method: 'OPTIONS' })
  expect(res.status).toBe(204)
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
  expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  expect(res.headers.get('access-control-allow-headers')).toContain('authorization')
})

test('normal responses carry Access-Control-Allow-Origin', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/health`)
  expect(res.status).toBe(200)
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
})

test('401 from a guarded route still carries CORS header', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  expect(res.status).toBe(401)
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
})

test('responses expose content-disposition for the export filename', async () => {
  server = makeServer()
  const res = await fetch(`http://localhost:${server.port}/health`)
  expect(res.headers.get('access-control-expose-headers')).toContain('content-disposition')
})
