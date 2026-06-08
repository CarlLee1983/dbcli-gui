import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Sidebar } from '../../src/views/Sidebar'
import type { ConnectionSummary, TreeTable, TableColumnDto } from '../../src/api/types'

afterEach(cleanup)

const connections: ConnectionSummary[] = [
  { name: 'prod', system: 'postgresql', isDefault: true },
  { name: 'staging', system: 'mysql', isDefault: false },
]
const tree: TreeTable[] = [{ name: 'users', type: 'table' }, { name: 'v_active', type: 'view' }]
const expanded: Record<string, TableColumnDto[]> = { users: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }] }

function setup(over: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const calls = { select: [] as string[], load: [] as string[], insert: [] as string[] }
  render(
    <Sidebar
      connections={connections}
      activeConnectionId="prod"
      tree={tree}
      expandedColumns={expanded}
      onSelectConnection={(id) => calls.select.push(id)}
      onLoadColumns={(t) => calls.load.push(t)}
      onInsertSelect={(t) => calls.insert.push(t)}
      {...over}
    />,
  )
  return calls
}

test('renders the connection list', () => {
  setup()
  expect(screen.getByText('prod')).toBeDefined()
  expect(screen.getByText('staging')).toBeDefined()
})

test('clicking a connection calls onSelectConnection', () => {
  const calls = setup()
  fireEvent.click(screen.getByText('staging'))
  expect(calls.select).toEqual(['staging'])
})

test('renders the schema tree tables', () => {
  setup()
  expect(screen.getByText('users')).toBeDefined()
  expect(screen.getByText('v_active')).toBeDefined()
})

test('clicking a table loads its columns', () => {
  const calls = setup()
  fireEvent.click(screen.getByText('v_active'))
  expect(calls.load).toEqual(['v_active'])
})

test('expanded columns are shown with a PK marker', () => {
  setup()
  expect(screen.getByText('id')).toBeDefined()
  expect(screen.getByText(/PK/)).toBeDefined()
})

test('the insert-select button calls onInsertSelect', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: /查詢 users/ }))
  expect(calls.insert).toEqual(['users'])
})
