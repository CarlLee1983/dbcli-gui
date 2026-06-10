// tests/frontend/useTabs.test.ts
import { test, expect, beforeEach } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTabs } from '../../src/hooks/useTabs'
import { ApiError, type DbClient } from '../../src/api/client'
import type { HistoryEntry } from '../../src/hooks/useHistory'

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    health: async () => ({ ok: true, version: '0.1.0' }),
    listConnections: async () => ({ connections: [] }),
    openConnection: async () => ({ ok: true, system: 'postgresql', permission: 'query-only' as const }),
    closeConnection: async () => ({ ok: true }),
    query: async () => ({ rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 2 }),
    schemaTree: async () => ({ tables: [] }),
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

function harness(over: Partial<DbClient> = {}, connId: string | null = 'a') {
  const recorded: HistoryEntry[] = []
  const { result } = renderHook(() => useTabs({ client: fakeClient(over), activeConnectionId: connId, onRecord: (e) => recorded.push(e) }))
  return { result, recorded }
}

beforeEach(() => { localStorage.clear() })

test('setSql updates the active session only', () => {
  const { result } = harness()
  act(() => { result.current.openTab() })
  act(() => { result.current.setSql('SELECT 1') })
  expect(result.current.active.sql).toBe('SELECT 1')
  expect(result.current.sessions[0]!.sql).toBe('')
})

test('runQuery stores result on the active session and records history', async () => {
  const { result, recorded } = harness()
  act(() => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.runQuery() })
  expect(result.current.active.result?.rowCount).toBe(1)
  expect(recorded[0]?.sql).toBe('SELECT 1')
  expect(recorded[0]?.connectionId).toBe('a')
})

test('runQuery on one tab does not affect another', async () => {
  const { result } = harness()
  act(() => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.runQuery() })
  act(() => { result.current.openTab() })
  expect(result.current.active.result).toBeNull()
  expect(result.current.sessions[0]!.result?.rowCount).toBe(1)
})

test('runQuery retries once after NOT_OPEN', async () => {
  let calls = 0
  const { result } = harness({
    query: async () => { calls++; if (calls === 1) throw new ApiError('NOT_OPEN', 'x', 409); return { rows: [], fields: [], rowCount: 0, ms: 1 } },
  })
  act(() => { result.current.setSql('SELECT 1') })
  await act(async () => { await result.current.runQuery() })
  expect(calls).toBe(2)
  expect(result.current.active.error).toBeNull()
})

test('runQuery surfaces a non-retryable error on the active session', async () => {
  const { result } = harness({ query: async () => { throw new ApiError('PERMISSION', 'ro', 403) } })
  act(() => { result.current.setSql('DELETE FROM t') })
  await act(async () => { await result.current.runQuery() })
  expect(result.current.active.error?.code).toBe('PERMISSION')
})

test('loadSql fills the active session sql', () => {
  const { result } = harness()
  act(() => { result.current.loadSql('SELECT 42') })
  expect(result.current.active.sql).toBe('SELECT 42')
})
