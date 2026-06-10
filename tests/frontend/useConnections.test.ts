import { test, expect } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useConnections } from '../../src/hooks/useConnections'
import type { DbClient } from '../../src/api/client'

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    health: async () => ({ ok: true, version: '0.1.0' }),
    listConnections: async () => ({ connections: [{ name: 'a', system: 'postgresql', isDefault: true }] }),
    openConnection: async () => ({ ok: true, system: 'postgresql', permission: 'query-only' as const }),
    closeConnection: async () => ({ ok: true }),
    query: async () => ({ rows: [], fields: [], rowCount: 0, ms: 1 }),
    schemaTree: async () => ({ tables: [{ name: 't', type: 'table' }] }),
    schemaTable: async () => ({ name: 't', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }] }),
    exportRows: async () => {},
    createConnection: async () => ({ ok: true }),
    updateConnection: async () => ({ ok: true }),
    deleteConnection: async () => ({ ok: true }),
    setDefaultConnection: async () => ({ ok: true }),
    testConnection: async () => ({ ok: true, ms: 0 }),
    getConnection: async () => ({ name: 'a', system: 'postgresql', host: 'h', port: 5432, user: 'u', database: 'd' }),
    mutate: async () => ({ ok: true, applied: { updated: 0, inserted: 0, deleted: 0 } }),
    listWorkspaces: async () => ({ workspaces: [], activeId: 'global' }),
    addWorkspace: async (path: string) => ({ workspaces: [], added: { id: 'x', label: 'x', kind: 'project', path } }),
    removeWorkspace: async () => ({ workspaces: [], activeId: 'global' }),
    selectWorkspace: async () => ({ connections: [], activeId: 'global' }),
    ...over,
  }
}

function stubClient(over: Partial<DbClient>): DbClient {
  return fakeClient(over)
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

test('createConnection calls client then refreshes the list', async () => {
  const calls: string[] = []
  let listResult = [{ name: 'primary', system: 'mysql', isDefault: true }]
  const client = stubClient({
    createConnection: async () => { calls.push('create'); listResult = [...listResult, { name: 'staging', system: 'mysql', isDefault: false }]; return { ok: true } },
    listConnections: async () => ({ connections: listResult }),
  })
  const { result } = renderHook(() => useConnections(client))
  await waitFor(() => expect(result.current.online).toBe(true))
  await act(async () => { await result.current.createConnection({ name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd', password: 'p' }) })
  expect(calls).toEqual(['create'])
  await waitFor(() => expect(result.current.connections.map((c) => c.name)).toContain('staging'))
})

test('testConnection returns the result without touching the list', async () => {
  const client = stubClient({ testConnection: async () => ({ ok: true, ms: 9 }) })
  const { result } = renderHook(() => useConnections(client))
  await waitFor(() => expect(result.current.online).toBe(true))
  let r: { ok: boolean; ms: number } | undefined
  await act(async () => { r = await result.current.testConnection({ system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }) })
  expect(r).toEqual({ ok: true, ms: 9 })
})
