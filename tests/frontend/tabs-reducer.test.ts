import { test, expect } from 'bun:test'
import { tabsReducer, initTabs } from '../../src/hooks/tabs-reducer'

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

test('reset action 回到單一空白查詢分頁', () => {
  let state = initTabs()
  state = tabsReducer(state, { type: 'open' })
  state = tabsReducer(state, { type: 'open' })
  expect(state.sessions.length).toBe(3)
  const reset = tabsReducer(state, { type: 'reset' })
  expect(reset.sessions.length).toBe(1)
  expect(reset.sessions[0]!.sql).toBe('')
  expect(reset.sessions[0]!.browse).toBeNull()
})
