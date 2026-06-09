import { test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import { writeV2Config, readV2Config, resolveConnection, loadConnectionEnv } from '@carllee1983/dbcli/core'
import { writeProjectBinding, getProjectStoragePath } from '@carllee1983/dbcli/core'
import type { DatabaseAdapter } from '@carllee1983/dbcli/core'
import { ConnectionError } from '@carllee1983/dbcli/core'
import { makeConnectionAdminHandlers } from '../../sidecar/routes/connections-admin'

const TMP = '/tmp/dbcli-gui-admin-test'
const PROJECT = join(TMP, '.dbcli')

function initialConfig() {
  return {
    version: 2, default: 'primary',
    connections: {
      primary: { system: 'mysql', host: 'localhost', port: 3306, user: 'root',
        password: { $env: 'DBCLI_PRIMARY_PASSWORD' }, database: 'app', permission: 'query-only', envFile: '.env.primary' },
    },
    schema: {}, schemas: {}, metadata: { version: '2.0' },
    blacklist: { tables: [], columns: {} },
    audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
  }
}

function req(body: unknown): Request {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
}

let handlers: ReturnType<typeof makeConnectionAdminHandlers>

beforeEach(async () => {
  await Bun.$`rm -rf ${TMP}`
  await Bun.$`mkdir -p ${PROJECT}`
  await writeProjectBinding(PROJECT, getProjectStoragePath(PROJECT))
  await writeV2Config(PROJECT, initialConfig() as never)
  handlers = makeConnectionAdminHandlers(PROJECT)
})
afterEach(async () => {
  await Bun.$`rm -rf ${TMP}`
  delete process.env.DBCLI_STAGING_PASSWORD
})

test('create adds a connection + writes its secret, retrievable via reader', async () => {
  const res = await handlers.create(req({
    name: 'staging', system: 'postgresql', host: 'db.stg', port: 5432, user: 'app', database: 'app', password: 'sekret',
  }))
  expect(res.status).toBe(200)

  const cfg = await readV2Config(PROJECT)
  expect(Object.keys(cfg.connections).sort()).toEqual(['primary', 'staging'])
  const resolved = resolveConnection(cfg, 'staging')
  await loadConnectionEnv(resolved, getProjectStoragePath(PROJECT))
  expect(process.env.DBCLI_STAGING_PASSWORD).toBe('sekret')
})

test('create against a v1 project migrates it to v2 then adds the connection', async () => {
  // overwrite the seeded v2 config.json with a v1 (single-connection) one
  const v1 = {
    connection: { system: 'mysql', host: 'localhost', port: 3306, user: 'root', password: '', database: 'app' },
    permission: 'query-only', schema: {}, metadata: { version: '1.0' },
    blacklist: { tables: [], columns: {} },
    audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
  }
  await Bun.write(join(getProjectStoragePath(PROJECT), 'config.json'), JSON.stringify(v1, null, 2))

  const res = await handlers.create(req({ name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd', password: 'p' }))
  expect(res.status).toBe(200)

  const cfg = await readV2Config(PROJECT)
  expect(cfg.version).toBe(2)
  expect(Object.keys(cfg.connections).sort()).toEqual(['default', 'staging'])
})

test('create on a duplicate name → 409 CONFLICT', async () => {
  const res = await handlers.create(req({ name: 'primary', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect(res.status).toBe(409)
  expect((await res.json()).error.code).toBe('CONFLICT')
})

test('update with blank password keeps the existing secret', async () => {
  await handlers.create(req({ name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd', password: 'orig' }))
  const res = await handlers.update(req({ name: 'staging', system: 'mysql', host: 'h2', port: 3307, user: 'u', database: 'd' }))
  expect(res.status).toBe(200)
  const env = await Bun.file(join(getProjectStoragePath(PROJECT), '.env.staging')).text()
  expect(env).toContain('DBCLI_STAGING_PASSWORD=orig')
  expect((await readV2Config(PROJECT)).connections.staging.host).toBe('h2')
})

test('update unknown → 404 NOT_FOUND', async () => {
  const res = await handlers.update(req({ name: 'ghost', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect(res.status).toBe(404)
})

test('delete removes; deleting the only connection → 409', async () => {
  await handlers.create(req({ name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect((await handlers.remove(req({ name: 'staging' }))).status).toBe(200)
  const res = await handlers.remove(req({ name: 'primary' })) // last one
  expect(res.status).toBe(409)
})

test('set-default switches the default', async () => {
  await handlers.create(req({ name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect((await handlers.setDefault(req({ name: 'staging' }))).status).toBe(200)
  expect((await readV2Config(PROJECT)).default).toBe('staging')
})

test('get returns fields without the password', async () => {
  const res = await handlers.get(new Request('http://x/connections/get?name=primary'))
  const body = await res.json()
  expect(body).toMatchObject({ name: 'primary', system: 'mysql', host: 'localhost', port: 3306, user: 'root', database: 'app' })
  expect(body.password).toBeUndefined()
})

function fakeAdapter(result: { connect?: () => Promise<void>; ping?: boolean }): DatabaseAdapter {
  return {
    connect: result.connect ?? (async () => {}),
    disconnect: async () => {},
    testConnection: async () => result.ping ?? true,
    execute: async () => ({}) as never,
    listTables: async () => [],
    getTableSchema: async () => ({}) as never,
    getServerVersion: async () => '0',
  } as unknown as DatabaseAdapter
}

test('test handler returns ok on a successful ping', async () => {
  const h = makeConnectionAdminHandlers(PROJECT, { createAdapter: () => fakeAdapter({ ping: true }) })
  const res = await h.test(req({ system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd', password: 'p' }))
  expect(res.status).toBe(200)
  expect((await res.json()).ok).toBe(true)
})

test('test handler maps a false ping to CONNECTION 502', async () => {
  const h = makeConnectionAdminHandlers(PROJECT, { createAdapter: () => fakeAdapter({ ping: false }) })
  const res = await h.test(req({ system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect(res.status).toBe(502)
  expect((await res.json()).error.code).toBe('CONNECTION')
})

test('test handler maps a connect failure to CONNECTION 502', async () => {
  const h = makeConnectionAdminHandlers(PROJECT, {
    createAdapter: () => fakeAdapter({ connect: async () => { throw new ConnectionError('ECONNREFUSED', 'refused', []) } }),
  })
  const res = await h.test(req({ system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  expect(res.status).toBe(502)
  expect((await res.json()).error.code).toBe('CONNECTION')
})
