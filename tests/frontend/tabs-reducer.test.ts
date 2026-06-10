import { test, expect } from 'bun:test'
import { tabsReducer, initTabs, type TableSession } from '../../src/hooks/tabs-reducer'

test('initTabs has one empty active session', () => {
  const s = initTabs()
  expect(s.sessions.length).toBe(1)
  expect(s.activeId).toBe(s.sessions[0]!.id)
  expect(s.sessions[0]!.sql).toBe('')
})

test('open appends a new session and makes it active', () => {
  const s = tabsReducer(initTabs(), { type: 'open' })
  expect(s.sessions.length).toBe(2)
  expect(s.activeId).toBe(s.sessions[1]!.id)
})

test('patch updates only the targeted session', () => {
  let s = tabsReducer(initTabs(), { type: 'open' })
  const firstId = s.sessions[0]!.id
  s = tabsReducer(s, { type: 'patch', id: firstId, patch: { sql: 'SELECT 1' } })
  expect(s.sessions[0]!.sql).toBe('SELECT 1')
  expect(s.sessions[1]!.sql).toBe('')
})

test('closing the active tab moves active to a neighbor', () => {
  let s = tabsReducer(initTabs(), { type: 'open' }) // 2 tabs, active = 2nd
  const secondId = s.activeId
  s = tabsReducer(s, { type: 'close', id: secondId })
  expect(s.sessions.length).toBe(1)
  expect(s.activeId).toBe(s.sessions[0]!.id)
})

test('closing the last tab leaves one fresh empty tab', () => {
  let s = initTabs()
  s = tabsReducer(s, { type: 'close', id: s.activeId })
  expect(s.sessions.length).toBe(1)
  expect(s.sessions[0]!.sql).toBe('')
  expect(s.activeId).toBe(s.sessions[0]!.id)
})

test('rename changes only the title', () => {
  let s = initTabs()
  s = tabsReducer(s, { type: 'rename', id: s.activeId, title: '報表' })
  expect(s.sessions[0]!.title).toBe('報表')
})

test('setActive switches the active id', () => {
  let s = tabsReducer(initTabs(), { type: 'open' })
  const firstId = s.sessions[0]!.id
  s = tabsReducer(s, { type: 'setActive', id: firstId })
  expect(s.activeId).toBe(firstId)
})

test('ids are unique across open/close churn', () => {
  let s = initTabs()
  const ids = new Set([s.sessions[0]!.id])
  for (let i = 0; i < 5; i++) { s = tabsReducer(s, { type: 'open' }); ids.add(s.activeId) }
  expect(ids.size).toBe(6)
})

function tableInit(table = 'orders', connectionId = 'c1'): TableSession {
  return { connectionId, table, schema: { name: table, columns: [] }, subTab: 'structure' }
}

test('reset action 回到單一空白查詢分頁', () => {
  let state = initTabs()
  state = tabsReducer(state, { type: 'open' })
  state = tabsReducer(state, { type: 'open' })
  expect(state.sessions.length).toBe(3)
  const reset = tabsReducer(state, { type: 'reset' })
  expect(reset.sessions.length).toBe(1)
  expect(reset.sessions[0]!.sql).toBe('')
  expect(reset.sessions[0]!.table).toBeNull()
})

test('openTableTab 開新表分頁,title=表名,預設子頁籤', () => {
  const s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableInit('orders') })
  const active = s.sessions.find((x) => x.id === s.activeId)!
  expect(active.table?.table).toBe('orders')
  expect(active.table?.subTab).toBe('structure')
  expect(active.title).toBe('orders')
})

test('openTableTab 同 table+connection 已開 → 聚焦並切子頁籤,不重複開', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableInit('orders') })
  const firstCount = s.sessions.length
  s = tabsReducer(s, { type: 'openTableTab', session: { ...tableInit('orders'), subTab: 'content' } })
  expect(s.sessions.length).toBe(firstCount) // 沒有新開
  const active = s.sessions.find((x) => x.id === s.activeId)!
  expect(active.table?.table).toBe('orders')
  expect(active.table?.subTab).toBe('content')
})

test('setSubTab 改作用中表分頁的子頁籤', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableInit('orders') })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setSubTab', id, subTab: 'triggers' })
  expect(s.sessions.find((x) => x.id === id)!.table?.subTab).toBe('triggers')
})

test('setTableCache 寫入 lazy 快取', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableInit('orders') })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setTableCache', id, key: 'triggers', value: [{ name: 't', timing: 'AFTER', event: 'INSERT', statement: '' }] })
  expect(s.sessions.find((x) => x.id === id)!.table?.triggers).toHaveLength(1)
})

test('setTableRows 更新內容列', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: { ...tableInit('orders'), rows: [] } })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setTableRows', id, rows: [{ id: 1 }] })
  expect(s.sessions.find((x) => x.id === id)!.table?.rows).toEqual([{ id: 1 }])
})

test('setSubTabError 記錄單一子頁籤錯誤', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableInit('orders') })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setSubTabError', id, key: 'info', error: { code: 'PERMISSION', message: 'no', status: 403 } })
  expect(s.sessions.find((x) => x.id === id)!.table?.cacheErrors?.info?.code).toBe('PERMISSION')
})

test('openTableTab 重新聚焦(structure)不清掉既有內容列', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: { ...tableInit('orders'), subTab: 'content', rows: [{ id: 1 }] } })
  const id = s.activeId
  // 重新以 structure 聚焦同表(session 不帶 rows)→ 既有 rows 應保留
  s = tabsReducer(s, { type: 'openTableTab', session: tableInit('orders') })
  const active = s.sessions.find((x) => x.id === id)!
  expect(active.table?.subTab).toBe('structure')
  expect(active.table?.rows).toEqual([{ id: 1 }])
})
