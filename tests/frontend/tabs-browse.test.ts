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

test('setContentFilter stores the filter, rows, sql, total and resets to page 0', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableSession({ page: 2 }) })
  const id = s.activeId
  s = tabsReducer(s, {
    type: 'setContentFilter',
    id,
    filter: { column: 'email', op: 'contains', value: 'gmail' },
    sql: "SELECT * FROM users WHERE email LIKE '%gmail%' LIMIT 200",
    rows: [{ id: 7 }],
    total: 42,
  })
  const t = s.sessions.find((x) => x.id === id)!.table!
  expect(t.filter).toEqual({ column: 'email', op: 'contains', value: 'gmail' })
  expect(t.rows).toEqual([{ id: 7 }])
  expect(t.sql).toBe("SELECT * FROM users WHERE email LIKE '%gmail%' LIMIT 200")
  expect(t.total).toBe(42)
  expect(t.page).toBe(0)
})

test('setContentFilter with null clears the filter', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableSession({ filter: { column: 'email', op: '=', value: 'x' } }) })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setContentFilter', id, filter: null, sql: 'SELECT * FROM users LIMIT 200', rows: [], total: 100 })
  expect(s.sessions.find((x) => x.id === id)!.table!.filter).toBeNull()
})

test('setContentPage advances the page and replaces rows + sql', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableSession() })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setContentPage', id, page: 3, sql: 'SELECT * FROM users LIMIT 200 OFFSET 600', rows: [{ id: 601 }] })
  const t = s.sessions.find((x) => x.id === id)!.table!
  expect(t.page).toBe(3)
  expect(t.rows).toEqual([{ id: 601 }])
  expect(t.sql).toBe('SELECT * FROM users LIMIT 200 OFFSET 600')
})

test('setContentTotal records the row count without touching rows', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableSession({ rows: [{ id: 1 }] }) })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setContentTotal', id, total: 3482 })
  const t = s.sessions.find((x) => x.id === id)!.table!
  expect(t.total).toBe(3482)
  expect(t.rows).toEqual([{ id: 1 }])
})

test('setContentSort resets the page back to 0', () => {
  let s = tabsReducer(initTabs(), { type: 'openTableTab', session: tableSession({ page: 4 }) })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setContentSort', id, sortField: 'id', sortDir: 'asc', sql: 'SELECT * FROM users ORDER BY id ASC LIMIT 200', rows: [{ id: 1 }] })
  expect(s.sessions.find((x) => x.id === id)!.table!.page).toBe(0)
})
