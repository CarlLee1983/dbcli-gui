import { test, expect, beforeEach } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSidecar } from '../../src/hooks/useSidecar'
import type { DbClient } from '../../src/api/client'
import { ApiError } from '../../src/api/client'

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    health: async () => ({ ok: true, version: '0.1.0' }),
    listConnections: async () => ({ connections: [{ name: 'a', system: 'postgresql', isDefault: true }] }),
    openConnection: async () => ({ ok: true, system: 'postgresql' }),
    closeConnection: async () => ({ ok: true }),
    query: async () => ({ rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 3 }),
    schemaTree: async () => ({ tables: [{ name: 't', type: 'table' }] }),
    schemaTable: async () => ({ name: 't', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }] }),
    exportRows: async () => {},
    ...over,
  }
}

test('on mount it checks health and loads connections', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await waitFor(() => expect(result.current.connections.length).toBe(1))
})

test('health failure marks offline and skips loading connections', async () => {
  let listed = 0
  const client = fakeClient({
    health: async () => { throw new Error('down') },
    listConnections: async () => { listed++; return { connections: [] } },
  })
  const { result } = renderHook(() => useSidecar(client))
  await waitFor(() => expect(result.current.online).toBe(false))
  expect(listed).toBe(0)
})

test('selectConnection opens it and loads the schema tree', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  expect(result.current.activeConnectionId).toBe('a')
  expect(result.current.tree.length).toBe(1)
})

test('insertSelect sets a SELECT statement into sql', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { result.current.insertSelect('users') })
  expect(result.current.sql).toBe('SELECT * FROM users LIMIT 100')
})

test('runQuery stores the result', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  await act(async () => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.runQuery() })
  expect(result.current.result?.rowCount).toBe(1)
})

test('runQuery retries once after NOT_OPEN by reopening the connection', async () => {
  let queryCalls = 0
  let openCalls = 0
  const client = fakeClient({
    openConnection: async () => { openCalls++; return { ok: true, system: 'postgresql' } },
    query: async () => {
      queryCalls++
      if (queryCalls === 1) throw new ApiError('NOT_OPEN', 'connection not open', 409)
      return { rows: [], fields: [], rowCount: 0, ms: 1 }
    },
  })
  const { result } = renderHook(() => useSidecar(client))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  const openBefore = openCalls
  await act(async () => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.runQuery() })
  expect(queryCalls).toBe(2)
  expect(openCalls).toBe(openBefore + 1)
  expect(result.current.error).toBeNull()
})

test('runQuery surfaces a non-retryable ApiError', async () => {
  const client = fakeClient({
    query: async () => { throw new ApiError('PERMISSION', 'read-only', 403) },
  })
  const { result } = renderHook(() => useSidecar(client))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  await act(async () => { result.current.setSql('DELETE FROM t') })
  await act(async () => { await result.current.runQuery() })
  expect(result.current.error?.code).toBe('PERMISSION')
})

test('loadTableColumns populates expandedColumns for the table', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  await act(async () => { await result.current.loadTableColumns('t') })
  expect(result.current.expandedColumns['t']?.[0]?.name).toBe('id')
})

test('exportResult calls exportRows with the active connection, sql, and format', async () => {
  const calls: Array<[string, string, string]> = []
  const client = fakeClient({ exportRows: async (id, sql, fmt) => { calls.push([id, sql, fmt]) } })
  const { result } = renderHook(() => useSidecar(client))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  await act(async () => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.exportResult('csv') })
  expect(calls).toEqual([['a', 'SELECT 1', 'csv']])
})

test('dismissError clears the error', async () => {
  const client = fakeClient({ query: async () => { throw new ApiError('PERMISSION', 'ro', 403) } })
  const { result } = renderHook(() => useSidecar(client))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  await act(async () => { result.current.setSql('DELETE FROM t') })
  await act(async () => { await result.current.runQuery() })
  expect(result.current.error?.code).toBe('PERMISSION')
  act(() => result.current.dismissError())
  expect(result.current.error).toBeNull()
})

beforeEach(() => { localStorage.clear() })

test('successful runQuery records a history entry tagged with the connection', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  await act(async () => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.runQuery() })
  expect(result.current.history.entries[0]?.sql).toBe('SELECT 1')
  expect(result.current.history.entries[0]?.connectionId).toBe('a')
})

test('loadFromHistory fills the editor with the given sql', async () => {
  const { result } = renderHook(() => useSidecar(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  act(() => { result.current.loadFromHistory('SELECT 42') })
  expect(result.current.sql).toBe('SELECT 42')
})
