import { test, expect, afterEach } from 'bun:test'
import { makeClient, ApiError, readConnParams } from '../../src/api/client'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

interface Recorded { url: string; init: RequestInit | undefined }

function stubFetch(handler: (rec: Recorded) => Response): Recorded[] {
  const calls: Recorded[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rec = { url: String(input), init }
    calls.push(rec)
    return handler(rec)
  }) as typeof fetch
  return calls
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('readConnParams reads port and token from a query string', () => {
  expect(readConnParams('?port=1234&token=abc')).toEqual({ port: '1234', token: 'abc' })
})

test('readConnParams prefers the injected window.__DBCLI__ global over the query string', () => {
  ;(globalThis as { __DBCLI__?: unknown }).__DBCLI__ = { port: 9999, token: 'injected' }
  try {
    expect(readConnParams('?port=1&token=fromquery')).toEqual({ port: '9999', token: 'injected' })
  } finally {
    delete (globalThis as { __DBCLI__?: unknown }).__DBCLI__
  }
})

test('readConnParams falls back to the query string when no global is injected', () => {
  expect(readConnParams('?port=1234&token=abc')).toEqual({ port: '1234', token: 'abc' })
})

test('query() POSTs to the right URL with bearer token and parses the body', async () => {
  const calls = stubFetch(() => jsonRes({ rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 5 }))
  const client = makeClient('http://127.0.0.1:1234', 'tok')
  const result = await client.query('conn', 'SELECT 1', 100)
  expect(result.rows).toEqual([{ id: 1 }])
  expect(calls[0]!.url).toBe('http://127.0.0.1:1234/query')
  const init = calls[0]!.init!
  expect(init.method).toBe('POST')
  expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok')
  expect(JSON.parse(init.body as string)).toEqual({ connectionId: 'conn', sql: 'SELECT 1', limit: 100 })
})

test('query() omits the limit key when no limit is passed', async () => {
  const calls = stubFetch(() => jsonRes({ rows: [], fields: [], rowCount: 0, ms: 0 }))
  const client = makeClient('http://127.0.0.1:1234', 'tok')
  await client.query('conn', 'SELECT 1')
  expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ connectionId: 'conn', sql: 'SELECT 1' })
})

test('non-2xx with a non-JSON body falls back to statusText + INTERNAL', async () => {
  stubFetch(() => new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' }))
  const client = makeClient('http://127.0.0.1:1234', 'tok')
  await expect(client.health()).rejects.toMatchObject({ code: 'INTERNAL', message: 'Service Unavailable', status: 503 })
})

test('health() returns the body', async () => {
  stubFetch(() => jsonRes({ ok: true, version: '0.1.0' }))
  const client = makeClient('http://127.0.0.1:1234', 'tok')
  expect(await client.health()).toEqual({ ok: true, version: '0.1.0' })
})

test('schemaTable() unwraps the { table } envelope', async () => {
  stubFetch(() => jsonRes({ table: { name: 't', columns: [{ name: 'id', type: 'int', nullable: false }] } }))
  const client = makeClient('http://127.0.0.1:1234', 'tok')
  const table = await client.schemaTable('conn', 't')
  expect(table.name).toBe('t')
  expect(table.columns[0]!.name).toBe('id')
})

test('non-2xx throws ApiError carrying code, message, status', async () => {
  stubFetch(() => jsonRes({ error: { code: 'BLACKLISTED', message: 'protected' } }, 403))
  const client = makeClient('http://127.0.0.1:1234', 'tok')
  try {
    await client.query('conn', 'SELECT * FROM secrets')
    throw new Error('should have thrown')
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError)
    const e = err as ApiError
    expect(e.code).toBe('BLACKLISTED')
    expect(e.message).toBe('protected')
    expect(e.status).toBe(403)
  }
})

test('createConnection posts to /connections/create', async () => {
  const calls = stubFetch(({ init }) => jsonRes({ ok: true }))
  const c = makeClient('http://x', 't')
  await c.createConnection({ name: 'a', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd', password: 'p' })
  expect(calls[0]!.url).toBe('http://x/connections/create')
  expect(JSON.parse(calls[0]!.init!.body as string)).toMatchObject({ name: 'a', system: 'mysql' })
})

test('testConnection returns { ok, ms }', async () => {
  stubFetch(() => jsonRes({ ok: true, ms: 12 }))
  const c = makeClient('http://x', 't')
  expect(await c.testConnection({ system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' })).toEqual({ ok: true, ms: 12 })
})

test('getConnection reads ?name=', async () => {
  const calls = stubFetch(() => jsonRes({ name: 'a', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }))
  const c = makeClient('http://x', 't')
  await c.getConnection('a')
  expect(calls[0]!.url).toBe('http://x/connections/get?name=a')
})

test('exportRows() triggers a download with the content-disposition filename', async () => {
  stubFetch(() =>
    new Response('a,b\n1,2', {
      status: 200,
      headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="export.csv"' },
    }),
  )
  const origCreate = (URL as unknown as { createObjectURL?: unknown }).createObjectURL
  const origRevoke = (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
  ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake'
  ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}
  const clicked: string[] = []
  const origClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicked.push(this.download) }
  try {
    const client = makeClient('http://127.0.0.1:1234', 'tok')
    await client.exportRows('conn', 'SELECT 1', 'csv')
    expect(clicked).toEqual(['export.csv'])
  } finally {
    HTMLAnchorElement.prototype.click = origClick
    ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = origCreate
    ;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = origRevoke
  }
})

import { test as mt, expect as me, afterEach as ma } from 'bun:test'
import { makeClient as mkClient } from '../../src/api/client'

const savedFetch = globalThis.fetch
ma(() => { globalThis.fetch = savedFetch })

mt('mutate posts ops and returns applied counts', async () => {
  let captured: { url: string; body: unknown } | null = null
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    captured = { url: String(url), body: JSON.parse(String(init?.body)) }
    return new Response(JSON.stringify({ ok: true, applied: { updated: 1, inserted: 0, deleted: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  const client = mkClient('http://x', 'tok')
  const ops = { updates: [{ pk: { id: 1 }, set: { name: 'a' } }], inserts: [], deletes: [] }
  const res = await client.mutate('main', 'users', ops)
  me(res.applied.updated).toBe(1)
  me(captured!.url).toBe('http://x/data/mutate')
  me(captured!.body).toEqual({ connectionId: 'main', table: 'users', ops })
})
