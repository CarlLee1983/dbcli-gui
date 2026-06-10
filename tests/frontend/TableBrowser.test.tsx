import { test, expect, afterEach } from 'bun:test'
import { render, cleanup, fireEvent } from '@testing-library/react'
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
