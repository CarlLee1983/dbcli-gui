import { test, expect } from 'bun:test'
import { tabsReducer, initTabs, type TableSession } from '../../src/hooks/tabs-reducer'
import type { TableSchemaDto } from '../../src/api/types'

const schema: TableSchemaDto = { name: 'users', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }], primaryKey: ['id'] }
const tableSession = (over: Partial<TableSession> = {}): TableSession => ({ connectionId: 'c1', table: 'users', schema, subTab: 'content', rows: [{ id: 1 }], sql: 'SELECT * FROM users LIMIT 200', ...over })

test('openTableTab opens a new active table tab titled after the table', () => {
  const s1 = tabsReducer(initTabs(), { type: 'openTableTab', session: tableSession() })
  const active = s1.sessions.find((s) => s.id === s1.activeId)!
  expect(active.title).toBe('users')
  expect(active.table?.table).toBe('users')
  expect(active.table?.rows).toEqual([{ id: 1 }])
})

test('setTableRows replaces rows on a table tab', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableSession() })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setTableRows', id, rows: [{ id: 1 }, { id: 2 }] })
  expect(s.sessions.find((x) => x.id === id)!.table?.rows).toEqual([{ id: 1 }, { id: 2 }])
})

test('setTableRows is a no-op on a non-table (query) tab', () => {
  const s0 = initTabs()
  const s1 = tabsReducer(s0, { type: 'setTableRows', id: s0.activeId, rows: [{ id: 9 }] })
  expect(s1.sessions.find((x) => x.id === s0.activeId)!.table).toBeNull()
})
