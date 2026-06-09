import { test, expect } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useConnections } from '../../src/hooks/useConnections'
import type { DbClient } from '../../src/api/client'

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    health: async () => ({ ok: true, version: '0.1.0' }),
    listConnections: async () => ({ connections: [{ name: 'a', system: 'postgresql', isDefault: true }] }),
    openConnection: async () => ({ ok: true, system: 'postgresql' }),
    closeConnection: async () => ({ ok: true }),
    query: async () => ({ rows: [], fields: [], rowCount: 0, ms: 1 }),
    schemaTree: async () => ({ tables: [{ name: 't', type: 'table' }] }),
    schemaTable: async () => ({ name: 't', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }] }),
    exportRows: async () => {},
    ...over,
  }
}

test('on mount checks health and loads connections', async () => {
  const { result } = renderHook(() => useConnections(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await waitFor(() => expect(result.current.connections.length).toBe(1))
})

test('selectConnection opens it and loads the schema tree', async () => {
  const { result } = renderHook(() => useConnections(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  expect(result.current.activeConnectionId).toBe('a')
  expect(result.current.tree.length).toBe(1)
})

test('loadTableColumns populates expandedColumns', async () => {
  const { result } = renderHook(() => useConnections(fakeClient()))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.selectConnection('a') })
  await act(async () => { await result.current.loadTableColumns('t') })
  expect(result.current.expandedColumns['t']?.[0]?.name).toBe('id')
})

test('health failure marks offline', async () => {
  const { result } = renderHook(() => useConnections(fakeClient({ health: async () => { throw new Error('down') } })))
  await waitFor(() => expect(result.current.online).toBe(false))
})
