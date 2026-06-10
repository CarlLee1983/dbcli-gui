import { test, expect } from 'bun:test'
import {
  GLOBAL_ID, defaultWorkspacesFile, listWorkspaces, addWorkspace,
  removeWorkspace, setLastActive, resolvePath, makeProjectWorkspace,
  WorkspaceRegistry,
  type Workspace,
} from '../../sidecar/workspaces'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const G = '/home/u/.dbcli'

test('list 一定把 global 放第一個', () => {
  const file = defaultWorkspacesFile()
  const list = listWorkspaces(file, G)
  expect(list[0]).toEqual({ id: GLOBAL_ID, label: '全域', kind: 'global', path: G })
})

test('add 後 list 含該專案;同 id 覆寫不重複', () => {
  const ws: Workspace = { id: 'p1', label: 'proj', kind: 'project', path: '/proj/.dbcli' }
  let file = addWorkspace(defaultWorkspacesFile(), ws)
  file = addWorkspace(file, { ...ws, label: 'renamed' })
  const list = listWorkspaces(file, G)
  expect(list).toHaveLength(2)
  expect(list[1]!.label).toBe('renamed')
})

test('remove global 會丟錯', () => {
  expect(() => removeWorkspace(defaultWorkspacesFile(), GLOBAL_ID)).toThrow()
})

test('remove 目前 active 會把 lastActive 退回 global', () => {
  const ws: Workspace = { id: 'p1', label: 'proj', kind: 'project', path: '/proj/.dbcli' }
  let file = addWorkspace(defaultWorkspacesFile(), ws)
  file = setLastActive(file, 'p1')
  file = removeWorkspace(file, 'p1')
  expect(file.lastActiveId).toBe(GLOBAL_ID)
  expect(file.workspaces).toHaveLength(0)
})

test('resolvePath:global→globalDir、專案→其 path、未知→丟錯', () => {
  const ws: Workspace = { id: 'p1', label: 'proj', kind: 'project', path: '/proj/.dbcli' }
  const file = addWorkspace(defaultWorkspacesFile(), ws)
  expect(resolvePath(file, GLOBAL_ID, G)).toBe(G)
  expect(resolvePath(file, 'p1', G)).toBe('/proj/.dbcli')
  expect(() => resolvePath(file, 'nope', G)).toThrow()
})

test('makeProjectWorkspace:label 預設取資料夾名、path 指向 .dbcli、id 唯一', () => {
  const a = makeProjectWorkspace('/Users/me/shop')
  expect(a.label).toBe('shop')
  expect(a.path).toBe('/Users/me/shop/.dbcli')
  expect(a.kind).toBe('project')
  const b = makeProjectWorkspace('/Users/me/shop')
  expect(a.id).not.toBe(b.id)
})

test('WorkspaceRegistry:add→persist→reload 還原', async () => {
  const dir = join(tmpdir(), `dbcli-ws-${crypto.randomUUID()}`)
  const reg = await WorkspaceRegistry.load(dir)
  const ws = await reg.add('/some/proj')
  await reg.setLastActive(ws.id)

  const reloaded = await WorkspaceRegistry.load(dir)
  expect(reloaded.activeId()).toBe(ws.id)
  expect(reloaded.list().map((w) => w.id)).toContain(ws.id)
  expect(reloaded.resolvePath(ws.id)).toBe('/some/proj/.dbcli')

  await reloaded.remove(ws.id)
  expect((await WorkspaceRegistry.load(dir)).activeId()).toBe('global')
})

test('WorkspaceRegistry.load:檔案毀損→退回僅 global', async () => {
  const dir = join(tmpdir(), `dbcli-ws-${crypto.randomUUID()}`)
  await Bun.$`mkdir -p ${dir}`
  await Bun.write(join(dir, 'workspaces.json'), '{ not json')
  const reg = await WorkspaceRegistry.load(dir)
  expect(reg.list()).toHaveLength(1)
  expect(reg.activeId()).toBe('global')
})
