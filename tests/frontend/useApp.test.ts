import { test, expect, beforeEach } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApp } from '../../src/hooks/useApp'
import type { DbClient } from '../../src/api/client'

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    health: async () => ({ ok: true, version: '0.1.0' }),
    listConnections: async () => ({ connections: [{ name: 'a', system: 'postgresql', isDefault: true }] }),
    openConnection: async () => ({ ok: true, system: 'postgresql' }),
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
