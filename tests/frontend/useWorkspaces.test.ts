import { test, expect } from 'bun:test'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWorkspaces } from '../../src/hooks/useWorkspaces'
import type { DbClient } from '../../src/api/client'
import type { Workspace, ConnectionSummary } from '../../src/api/types'

const G: Workspace = { id: 'global', label: '全域', kind: 'global', path: '~/.dbcli' }
const P: Workspace = { id: 'p1', label: 'proj', kind: 'project', path: '/proj/.dbcli' }

function fakeClient(over: Partial<DbClient> = {}): DbClient {
  return {
    listWorkspaces: async () => ({ workspaces: [G], activeId: 'global' }),
    addWorkspace: async () => ({ workspaces: [G, P], added: P }),
    removeWorkspace: async () => ({ workspaces: [G], activeId: 'global' }),
    selectWorkspace: async () => ({ connections: [] as ConnectionSummary[], activeId: 'p1' }),
    ...over,
  } as unknown as DbClient
}

test('mount 後載入清單與 activeId', async () => {
  const { result } = renderHook(() => useWorkspaces(fakeClient()))
  await waitFor(() => expect(result.current.workspaces).toHaveLength(1))
  expect(result.current.activeId).toBe('global')
})

test('add 後清單更新', async () => {
  const { result } = renderHook(() => useWorkspaces(fakeClient()))
  await waitFor(() => expect(result.current.workspaces).toHaveLength(1))
  await act(async () => { await result.current.add('/proj') })
  expect(result.current.workspaces.map((w) => w.id)).toContain('p1')
})

test('select 回傳新連線清單並更新 activeId', async () => {
  const { result } = renderHook(() => useWorkspaces(fakeClient()))
  await waitFor(() => expect(result.current.activeId).toBe('global'))
  let conns: ConnectionSummary[] = []
  await act(async () => { conns = await result.current.select('p1') })
  expect(result.current.activeId).toBe('p1')
  expect(Array.isArray(conns)).toBe(true)
})
