import { test, expect, beforeEach } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApp } from '../../src/hooks/useApp'
import type { DbClient } from '../../src/api/client'

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    health: async () => ({ ok: true, version: '0.1.0' }),
    listConnections: async () => ({ connections: [{ name: 'a', system: 'postgresql', isDefault: true }] }),
    openConnection: async () => ({ ok: true, system: 'postgresql', permission: 'query-only' as const }),
    closeConnection: async () => ({ ok: true }),
    query: async () => ({ rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 2 }),
    schemaTree: async () => ({ tables: [{ name: 't', type: 'table' }] }),
    schemaTable: async () => ({ name: 't', columns: [] }),
    exportRows: async () => {},
    createConnection: async () => ({ ok: true }),
    updateConnection: async () => ({ ok: true }),
    deleteConnection: async () => ({ ok: true }),
    setDefaultConnection: async () => ({ ok: true }),
    testConnection: async () => ({ ok: true, ms: 0 }),
    getConnection: async () => ({ name: '', system: 'mysql', host: '', port: 0, user: '', database: '' }),
    mutate: async () => ({ ok: true, applied: { updated: 0, inserted: 0, deleted: 0 } }),
    ...over,
  }
}

beforeEach(() => { localStorage.clear() })

test('runQuery records into shared history across the active tab', async () => {
  const { result } = renderHook(() => useApp(fakeClient()))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  act(() => { result.current.tabs.setSql('SELECT 1') })
  await act(async () => { await result.current.tabs.runQuery() })
  expect(result.current.history.entries[0]?.sql).toBe('SELECT 1')
})

test('exportResult forwards active connection + active sql + format', async () => {
  const calls: Array<[string, string, string]> = []
  const { result } = renderHook(() => useApp(fakeClient({ exportRows: async (id, sql, fmt) => { calls.push([id, sql, fmt]) } })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  act(() => { result.current.tabs.setSql('SELECT 1') })
  await act(async () => { await result.current.exportResult('csv') })
  expect(calls).toEqual([['a', 'SELECT 1', 'csv']])
})

test('browseTable calls schemaTable + query and opens a browse tab', async () => {
  const schemaTableCalls: string[] = []
  const queryCalls: string[] = []
  const { result } = renderHook(() => useApp(fakeClient({
    schemaTable: async (id, table) => { schemaTableCalls.push(table); return { name: table, columns: [] } },
    query: async (id, sql) => { queryCalls.push(sql); return { rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 2 } },
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  await act(async () => { await result.current.browseTable('orders') })
  expect(schemaTableCalls).toContain('orders')
  expect(queryCalls.some((sql) => sql.includes('orders'))).toBe(true)
  expect(result.current.tabs.active.browse?.table).toBe('orders')
})

test('saveTableEdits on success calls mutate + query and returns true', async () => {
  const mutateCalls: Array<{ table: string }> = []
  const queryCalls: string[] = []
  const ops = { updates: [], inserts: [], deletes: [] }
  const { result } = renderHook(() => useApp(fakeClient({
    mutate: async (id, table, _ops) => { mutateCalls.push({ table }); return { ok: true, applied: { updated: 1, inserted: 0, deleted: 0 } } },
    query: async (id, sql) => { queryCalls.push(sql); return { rows: [], fields: [], rowCount: 0, ms: 1 } },
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  // Open a browse tab first so saveTableEdits has a tab to update
  await act(async () => { await result.current.browseTable('orders') })
  let ok = false
  await act(async () => { ok = await result.current.saveTableEdits('orders', ops) })
  expect(ok).toBe(true)
  expect(mutateCalls.some((c) => c.table === 'orders')).toBe(true)
  expect(queryCalls.some((sql) => sql.includes('orders'))).toBe(true)
})

test('saveTableEdits returns false and sets error when mutate rejects', async () => {
  const ops = { updates: [], inserts: [], deletes: [] }
  const { result } = renderHook(() => useApp(fakeClient({
    mutate: async () => { throw new Error('db error') },
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  await act(async () => { await result.current.browseTable('orders') })
  let ok = true
  await act(async () => { ok = await result.current.saveTableEdits('orders', ops) })
  expect(ok).toBe(false)
  expect(result.current.connections.error).not.toBeNull()
})
