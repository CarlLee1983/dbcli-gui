import { test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import { writeV2Config, writeProjectBinding, getProjectStoragePath, readV2Config } from '@carllee1983/dbcli/core'
import { ConnectionPool } from '../../sidecar/connection-pool'
import { createServer } from '../../sidecar/server'

const TMP = '/tmp/dbcli-gui-admin-route-test'
const PROJECT = join(TMP, '.dbcli')
const TOKEN = 'tok'

function initialConfig() {
  return {
    version: 2, default: 'primary',
    connections: { primary: { system: 'mysql', host: 'localhost', port: 3306, user: 'root',
      password: { $env: 'DBCLI_PRIMARY_PASSWORD' }, database: 'app', permission: 'query-only', envFile: '.env.primary' } },
    schema: {}, schemas: {}, metadata: { version: '2.0' },
    blacklist: { tables: [], columns: {} },
    audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
  }
}

let server: ReturnType<typeof createServer>
beforeEach(async () => {
  await Bun.$`rm -rf ${TMP}`; await Bun.$`mkdir -p ${PROJECT}`
  await writeProjectBinding(PROJECT, getProjectStoragePath(PROJECT))
  await writeV2Config(PROJECT, initialConfig() as never)
  const pool = new ConnectionPool({ loadConfig: async () => ({}) as never, openAdapter: () => ({}) as never })
  server = createServer({ pool, token: TOKEN, port: 0, dbcliPath: PROJECT })
})
afterEach(async () => { await server.stop(true); await Bun.$`rm -rf ${TMP}` })

test('POST /connections/create then list reflects it', async () => {
  const base = `http://127.0.0.1:${server.port}`
  const auth = { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }
  const res = await fetch(`${base}/connections/create`, { method: 'POST', headers: auth,
    body: JSON.stringify({ name: 'staging', system: 'postgresql', host: 'h', port: 5432, user: 'u', database: 'd', password: 'p' }) })
  expect(res.status).toBe(200)
  expect(Object.keys((await readV2Config(PROJECT)).connections).sort()).toEqual(['primary', 'staging'])
})

test('admin routes require auth', async () => {
  const res = await fetch(`http://127.0.0.1:${server.port}/connections/create`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  expect(res.status).toBe(401)
})
