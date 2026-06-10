import { test, expect } from 'bun:test'
import { tabsReducer, initTabs } from '../../src/hooks/tabs-reducer'
import type { TableSchemaDto } from '../../src/api/types'

const schema: TableSchemaDto = { name: 'users', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }], primaryKey: ['id'] }

test('openBrowse opens a new active browse tab titled after the table', () => {
  const s0 = initTabs()
  const s1 = tabsReducer(s0, { type: 'openBrowse', browse: { table: 'users', schema, rows: [{ id: 1 }] } })
  const active = s1.sessions.find((s) => s.id === s1.activeId)!
  expect(active.title).toBe('users')
  expect(active.browse?.table).toBe('users')
  expect(active.browse?.rows).toEqual([{ id: 1 }])
})

test('setBrowseRows replaces rows on a browse tab', () => {
  let s = initTabs()
  s = tabsReducer(s, { type: 'openBrowse', browse: { table: 'users', schema, rows: [{ id: 1 }] } })
  const id = s.activeId
  s = tabsReducer(s, { type: 'setBrowseRows', id, rows: [{ id: 1 }, { id: 2 }] })
  const active = s.sessions.find((x) => x.id === id)!
  expect(active.browse?.rows).toEqual([{ id: 1 }, { id: 2 }])
})

test('setBrowseRows is a no-op on a non-browse tab', () => {
  const s0 = initTabs()
  const s1 = tabsReducer(s0, { type: 'setBrowseRows', id: s0.activeId, rows: [{ id: 9 }] })
  expect(s1.sessions.find((x) => x.id === s0.activeId)!.browse).toBeNull()
})
