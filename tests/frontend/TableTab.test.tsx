import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TableTab } from '../../src/views/TableTab'
import type { TableSession } from '../../src/hooks/tabs-reducer'

afterEach(cleanup)

function session(over: Partial<TableSession> = {}): TableSession {
  return { connectionId: 'c1', table: 'orders', schema: { name: 'orders', columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }], primaryKey: ['id'] }, subTab: 'structure', ...over }
}

const noop = () => {}
const baseProps = {
  permission: 'read-write' as const,
  saving: false,
  onSetSubTab: noop,
  onLoadSubTab: noop,
  onOpenQuery: noop,
  onSave: async () => true,
}

test('renders the five sub-tab buttons and the open-query button', () => {
  render(<TableTab session={session()} {...baseProps} />)
  for (const label of ['結構', '內容', '關聯', '觸發器', '資訊']) {
    expect(screen.getByRole('button', { name: label })).toBeDefined()
  }
  expect(screen.getByRole('button', { name: /以此表開新查詢/ })).toBeDefined()
})

test('clicking a sub-tab fires onSetSubTab + onLoadSubTab for lazy tabs', () => {
  const calls: string[] = []
  render(<TableTab session={session()} {...baseProps}
    onSetSubTab={(s) => calls.push(`set:${s}`)}
    onLoadSubTab={(k) => calls.push(`load:${k}`)} />)
  fireEvent.click(screen.getByRole('button', { name: '觸發器' }))
  expect(calls).toContain('set:triggers')
  expect(calls).toContain('load:triggers')
})

test('structure sub-tab does not trigger a lazy load', () => {
  const calls: string[] = []
  render(<TableTab session={session({ subTab: 'content' })} {...baseProps}
    onLoadSubTab={(k) => calls.push(k)} />)
  fireEvent.click(screen.getByRole('button', { name: '結構' }))
  expect(calls).toHaveLength(0)
})

test('open-query button fires onOpenQuery with a prefilled SELECT', () => {
  const opened: string[] = []
  render(<TableTab session={session()} {...baseProps} onOpenQuery={(sql) => opened.push(sql)} />)
  fireEvent.click(screen.getByRole('button', { name: /以此表開新查詢/ }))
  expect(opened[0]).toContain('SELECT * FROM orders')
})
