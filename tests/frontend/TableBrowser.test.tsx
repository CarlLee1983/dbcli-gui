import { test, expect, afterEach } from 'bun:test'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { TableBrowser } from '../../src/views/TableBrowser'
import type { TableSchemaDto } from '../../src/api/types'

afterEach(cleanup)

const schema: TableSchemaDto = {
  name: 'users',
  columns: [
    { name: 'id', type: 'int', nullable: false, primaryKey: true },
    { name: 'name', type: 'text', nullable: true },
  ],
  primaryKey: ['id'],
}
const rows = [{ id: 1, name: 'alice' }, { id: 2, name: 'bob' }]

function setup(over: Partial<React.ComponentProps<typeof TableBrowser>> = {}) {
  const calls = { save: [] as unknown[] }
  const utils = render(
    <TableBrowser
      table="users"
      schema={schema}
      rows={rows}
      permission="data-admin"
      saving={false}
      onSave={(ops) => { calls.save.push(ops) }}
      {...over}
    />,
  )
  return { ...utils, calls }
}

test('renders rows read-only by default (no inputs)', () => {
  const { container } = setup()
  expect(container.querySelectorAll('input').length).toBe(0)
})

test('entering edit mode reveals editable cells', () => {
  const { getByRole, container } = setup()
  fireEvent.click(getByRole('button', { name: '編輯' }))
  expect(container.querySelectorAll('input').length).toBeGreaterThan(0)
})

test('edit mode is disabled when permission is query-only', () => {
  const { getByRole } = setup({ permission: 'query-only' })
  expect((getByRole('button', { name: '編輯' }) as HTMLButtonElement).disabled).toBe(true)
})

test('disables editing and shows a banner when table has no primary key', () => {
  const { getByText, getByRole } = setup({ schema: { ...schema, primaryKey: [] } })
  expect(getByText(/無主鍵/)).toBeDefined()
  expect((getByRole('button', { name: '編輯' }) as HTMLButtonElement).disabled).toBe(true)
})

test('editing a cell then saving emits ops', () => {
  const { getByRole, getByLabelText, calls } = setup()
  fireEvent.click(getByRole('button', { name: '編輯' }))
  fireEvent.change(getByLabelText('編輯 name 第 1 列'), { target: { value: 'ALICE' } })
  fireEvent.click(getByRole('button', { name: /儲存/ }))
  expect(calls.save).toEqual([{ updates: [{ pk: { id: 1 }, set: { name: 'ALICE' } }], inserts: [], deletes: [] }])
})

test('toggling delete then saving emits a delete op', () => {
  const { getByRole, getByLabelText, calls } = setup()
  fireEvent.click(getByRole('button', { name: '編輯' }))
  fireEvent.click(getByLabelText('刪除第 1 列'))
  fireEvent.click(getByRole('button', { name: /儲存/ }))
  expect(calls.save).toEqual([{ updates: [], inserts: [], deletes: [{ pk: { id: 1 } }] }])
})

test('adding a row draft then saving emits an insert op', () => {
  const { getByRole, getByLabelText, calls } = setup()
  fireEvent.click(getByRole('button', { name: '編輯' }))
  fireEvent.click(getByRole('button', { name: '新增列' }))
  fireEvent.change(getByLabelText('新增 name 草稿 1'), { target: { value: 'carol' } })
  fireEvent.click(getByRole('button', { name: /儲存/ }))
  expect(calls.save).toEqual([{ updates: [], inserts: [{ values: { name: 'carol' } }], deletes: [] }])
})

test('successful save clears staged edits and exits edit mode', async () => {
  const { getByRole, getByLabelText, container } = setup({ onSave: () => Promise.resolve(true) })
  fireEvent.click(getByRole('button', { name: '編輯' }))
  fireEvent.change(getByLabelText('編輯 name 第 1 列'), { target: { value: 'X' } })
  fireEvent.click(getByRole('button', { name: /儲存/ }))
  await waitFor(() => expect(container.querySelectorAll('input').length).toBe(0))
  expect(getByRole('button', { name: '編輯' })).toBeDefined()
})

test('failed save keeps staged edits', async () => {
  const { getByRole, getByLabelText, container } = setup({ onSave: () => Promise.resolve(false) })
  fireEvent.click(getByRole('button', { name: '編輯' }))
  fireEvent.change(getByLabelText('編輯 name 第 1 列'), { target: { value: 'X' } })
  fireEvent.click(getByRole('button', { name: /儲存/ }))
  // still in edit mode with inputs present
  await new Promise((r) => setTimeout(r, 0))
  expect(container.querySelectorAll('input').length).toBeGreaterThan(0)
})

test('columns prop restricts rendered columns to the result field subset', () => {
  const wide: TableSchemaDto = {
    name: 'users',
    columns: [
      { name: 'id', type: 'int', nullable: false, primaryKey: true },
      { name: 'name', type: 'text', nullable: true },
      { name: 'email', type: 'text', nullable: true },
    ],
    primaryKey: ['id'],
  }
  const { container } = setup({ schema: wide, columns: ['id', 'name'] })
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  expect(headers).toContain('id')
  expect(headers).toContain('name')
  expect(headers).not.toContain('email')
})

test('hides 新增列 when the result projects only a subset of columns', () => {
  // A partial projection cannot supply values for unprojected NOT NULL columns, so
  // inserting a new row would fail at the DB — disable the affordance instead.
  const wide: TableSchemaDto = {
    name: 'users',
    columns: [
      { name: 'id', type: 'int', nullable: false, primaryKey: true },
      { name: 'name', type: 'text', nullable: true },
      { name: 'email', type: 'text', nullable: false },
    ],
    primaryKey: ['id'],
  }
  const { getByRole, queryByRole } = setup({ schema: wide, columns: ['id', 'name'] })
  fireEvent.click(getByRole('button', { name: '編輯' }))
  expect(queryByRole('button', { name: '新增列' })).toBeNull()
})

test('keeps 新增列 when columns cover the full schema', () => {
  const { getByRole } = setup({ columns: ['id', 'name'] })
  fireEvent.click(getByRole('button', { name: '編輯' }))
  expect(getByRole('button', { name: '新增列' })).toBeDefined()
})

test('cancel resets staged edits and exits edit mode', () => {
  const { getByRole, getByLabelText, container } = setup()
  fireEvent.click(getByRole('button', { name: '編輯' }))
  fireEvent.change(getByLabelText('編輯 name 第 1 列'), { target: { value: 'zzz' } })
  fireEvent.click(getByRole('button', { name: '取消' }))
  // back to read-only: no inputs, edit button visible again
  expect(container.querySelectorAll('input').length).toBe(0)
  expect(getByRole('button', { name: '編輯' })).toBeDefined()
})
