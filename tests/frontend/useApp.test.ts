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
    listWorkspaces: async () => ({ workspaces: [], activeId: 'global' }),
    addWorkspace: async (path: string) => ({ workspaces: [], added: { id: 'x', label: 'x', kind: 'project', path } }),
    removeWorkspace: async () => ({ workspaces: [], activeId: 'global' }),
    selectWorkspace: async () => ({ connections: [], activeId: 'global' }),
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

test('editQueryResult opens an editable browse tab bound to the original SQL', async () => {
  const editableSchema = { name: 'users', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }], primaryKey: ['id'] }
  const { result } = renderHook(() => useApp(fakeClient({
    schemaTable: async () => editableSchema,
    query: async () => ({ rows: [{ id: 1, name: 'a' }], fields: ['id', 'name'], rowCount: 1, ms: 1 }),
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  act(() => { result.current.tabs.setSql('SELECT id, name FROM users WHERE id < 5') })
  await act(async () => { await result.current.tabs.runQuery() })
  await act(async () => { await result.current.editQueryResult() })
  expect(result.current.tabs.active.browse?.table).toBe('users')
  expect(result.current.tabs.active.browse?.sql).toBe('SELECT id, name FROM users WHERE id < 5')
  expect(result.current.tabs.active.browse?.fields).toEqual(['id', 'name'])
})

test('editQueryResult sets an error and opens no browse tab when result is not editable', async () => {
  // detected table 'users' but PK 'id' is absent from the projected fields
  const { result } = renderHook(() => useApp(fakeClient({
    schemaTable: async () => ({ name: 'users', columns: [], primaryKey: ['id'] }),
    query: async () => ({ rows: [{ name: 'a' }], fields: ['name'], rowCount: 1, ms: 1 }),
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  act(() => { result.current.tabs.setSql('SELECT name FROM users') })
  await act(async () => { await result.current.tabs.runQuery() })
  await act(async () => { await result.current.editQueryResult() })
  expect(result.current.tabs.active.browse).toBeNull()
  expect(result.current.connections.error).not.toBeNull()
})

test('editQueryResult uses the executed SQL, not later unsaved editor text', async () => {
  // Guards against routing edits to the wrong table: after running a query the user
  // may retype the editor without re-running; editing must target what produced the result.
  const editableSchema = { name: 'users', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }], primaryKey: ['id'] }
  const schemaTableCalls: string[] = []
  const { result } = renderHook(() => useApp(fakeClient({
    schemaTable: async (_id, table) => { schemaTableCalls.push(table); return editableSchema },
    query: async () => ({ rows: [{ id: 1, name: 'a' }], fields: ['id', 'name'], rowCount: 1, ms: 1 }),
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  act(() => { result.current.tabs.setSql('SELECT * FROM users') })
  await act(async () => { await result.current.tabs.runQuery() })
  // retype the editor to a different table WITHOUT re-running
  act(() => { result.current.tabs.setSql('SELECT * FROM accounts') })
  await act(async () => { await result.current.editQueryResult() })
  expect(schemaTableCalls).toEqual(['users'])
  expect(result.current.tabs.active.browse?.table).toBe('users')
  expect(result.current.tabs.active.browse?.sql).toBe('SELECT * FROM users')
})

test('editQueryResult is a no-op when the active SQL is not a single-table SELECT', async () => {
  const schemaTableCalls: string[] = []
  const { result } = renderHook(() => useApp(fakeClient({
    schemaTable: async (_id, table) => { schemaTableCalls.push(table); return { name: table, columns: [] } },
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  act(() => { result.current.tabs.setSql('SELECT * FROM a JOIN b ON a.id = b.id') })
  await act(async () => { await result.current.tabs.runQuery() })
  await act(async () => { await result.current.editQueryResult() })
  expect(schemaTableCalls).toHaveLength(0)
  expect(result.current.tabs.active.browse).toBeNull()
})

test('switchWorkspace:套用新連線清單並重置查詢分頁', async () => {
  const client = fakeClient({
    selectWorkspace: async () => ({ connections: [{ name: 'wc', system: 'mysql', isDefault: true }], activeId: 'p1' }),
    listWorkspaces: async () => ({ workspaces: [{ id: 'global', label: '全域', kind: 'global' as const, path: '~/.dbcli' }], activeId: 'global' }),
  })
  const { result } = renderHook(() => useApp(client))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  act(() => { result.current.tabs.openTab() })
  await act(async () => { await result.current.switchWorkspace('p1') })
  expect(result.current.tabs.sessions).toHaveLength(1)
  expect(result.current.connections.connections.map((c) => c.name)).toEqual(['wc'])
  expect(result.current.connections.activeConnectionId).toBeNull()
})

test('switchWorkspace 失敗時不重置 connections/tabs，僅顯示錯誤', async () => {
  const client = fakeClient({
    selectWorkspace: async () => { throw new Error('boom') },
  })
  const { result } = renderHook(() => useApp(client))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  act(() => { result.current.tabs.openTab() })
  const tabsBefore = result.current.tabs.sessions.length
  await act(async () => { await result.current.switchWorkspace('p1') })
  expect(result.current.tabs.sessions).toHaveLength(tabsBefore) // 未被重置
  expect(result.current.connections.error).not.toBeNull()       // 錯誤已顯示
})

test('removeWorkspace 移除作用中 workspace → 重置 connections + 分頁', async () => {
  const client = fakeClient({
    removeWorkspace: async () => ({
      workspaces: [{ id: 'global', label: '全域', kind: 'global' as const, path: '~/.dbcli' }],
      activeId: 'global',
      connections: [{ name: 'gc', system: 'mysql', isDefault: true }],
    }),
  })
  const { result } = renderHook(() => useApp(client))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  act(() => { result.current.tabs.openTab() })
  await act(async () => { await result.current.removeWorkspace('p1') })
  expect(result.current.tabs.sessions).toHaveLength(1)
  expect(result.current.connections.connections.map((c) => c.name)).toEqual(['gc'])
})

test('removeWorkspace 移除非作用中 workspace → 不重置 connections + 分頁', async () => {
  const client = fakeClient({
    removeWorkspace: async () => ({
      workspaces: [{ id: 'global', label: '全域', kind: 'global' as const, path: '~/.dbcli' }],
      activeId: 'global',
      // 無 connections 欄位:非作用中 workspace 移除,不觸發重置
    }),
    listConnections: async () => ({ connections: [{ name: 'a', system: 'postgresql', isDefault: true }] }),
  })
  const { result } = renderHook(() => useApp(client))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  act(() => { result.current.tabs.openTab() })
  const tabsBefore = result.current.tabs.sessions.length
  await act(async () => { await result.current.removeWorkspace('other') })
  // 分頁未被重置
  expect(result.current.tabs.sessions).toHaveLength(tabsBefore)
  // 連線清單維持原本的 'a'
  expect(result.current.connections.connections.map((c) => c.name)).toEqual(['a'])
})

test('saveTableEdits refetches using the browse session stored SQL', async () => {
  const editableSchema = { name: 'users', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }], primaryKey: ['id'] }
  const queryCalls: string[] = []
  const { result } = renderHook(() => useApp(fakeClient({
    schemaTable: async () => editableSchema,
    query: async (_id, sql) => { queryCalls.push(sql); return { rows: [{ id: 1, name: 'a' }], fields: ['id', 'name'], rowCount: 1, ms: 1 } },
    mutate: async () => ({ ok: true, applied: { updated: 1, inserted: 0, deleted: 0 } }),
  })))
  await waitFor(() => expect(result.current.connections.online).toBe(true))
  await act(async () => { await result.current.connections.selectConnection('a') })
  act(() => { result.current.tabs.setSql('SELECT id, name FROM users WHERE id < 5') })
  await act(async () => { await result.current.tabs.runQuery() })
  await act(async () => { await result.current.editQueryResult() })
  queryCalls.length = 0
  await act(async () => { await result.current.saveTableEdits('users', { updates: [], inserts: [], deletes: [] }) })
  expect(queryCalls).toEqual(['SELECT id, name FROM users WHERE id < 5'])
})
