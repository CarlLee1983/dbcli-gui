import { test, expect } from 'bun:test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { makeWorkspaceHandlers } from '../../sidecar/routes/workspaces'
import { WorkspaceRegistry } from '../../sidecar/workspaces'
import type { ActiveStore } from '../../sidecar/active-store'

function req(body: unknown): Request {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
}

async function setup() {
  const dir = join(tmpdir(), `dbcli-wsr-${crypto.randomUUID()}`)
  const registry = await WorkspaceRegistry.load(dir)
  const store = { id: 'global', dbcliPath: dir, pool: {} as never, lister: async () => [] } as ActiveStore
  const selected: string[] = []
  const selectWorkspace = async (id: string) => {
    selected.push(id)
    store.id = id
    return [{ name: 'c1', system: 'mysql', isDefault: true }]
  }
  return { registry, store, selectWorkspace, selected }
}

test('list:預設只含 global,activeId=global', async () => {
  const { registry, store, selectWorkspace } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  const res = await h.list(req({}))
  const body = await res.json() as { workspaces: unknown[]; activeId: string }
  expect(body.workspaces).toHaveLength(1)
  expect(body.activeId).toBe('global')
})

test('add:回傳含新專案的清單', async () => {
  const { registry, store, selectWorkspace } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  const res = await h.add(req({ path: '/proj' }))
  const body = await res.json() as { workspaces: { kind: string }[]; added: { label: string } }
  expect(body.workspaces).toHaveLength(2)
  expect(body.added.label).toBe('proj')
})

test('select:呼叫 selectWorkspace 並回傳連線清單', async () => {
  const { registry, store, selectWorkspace, selected } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  const res = await h.select(req({ id: 'global' }))
  const body = await res.json() as { connections: unknown[]; activeId: string }
  expect(selected).toEqual(['global'])
  expect(body.connections).toHaveLength(1)
})

test('remove global → 400', async () => {
  const { registry, store, selectWorkspace } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  const res = await h.remove(req({ id: 'global' }))
  expect(res.status).toBe(400)
})

test('remove 目前 active 專案 → 自動切回 global 並回傳 connections', async () => {
  const { registry, store, selectWorkspace, selected } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  const added = await (await h.add(req({ path: '/proj' }))).json() as { added: { id: string } }
  store.id = added.added.id
  await registry.setLastActive(added.added.id)
  const res = await h.remove(req({ id: added.added.id }))
  const body = await res.json() as { activeId: string; connections?: unknown[] }
  expect(selected).toContain('global')
  expect(Array.isArray(body.connections)).toBe(true)
})

test('remove 非 active 專案 → 不回傳 connections', async () => {
  const { registry, store, selectWorkspace } = await setup()
  const h = makeWorkspaceHandlers(registry, store, selectWorkspace)
  // store.id 維持 'global',移除另一個專案
  const added = await (await h.add(req({ path: '/other' }))).json() as { added: { id: string } }
  const res = await h.remove(req({ id: added.added.id }))
  const body = await res.json() as { activeId: string; connections?: unknown[] }
  expect(body.activeId).toBe('global')
  expect(body.connections).toBeUndefined()
})
