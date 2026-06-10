import { test, expect, afterEach } from 'bun:test'
import { mock } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Sidebar } from '../../src/views/Sidebar'
import type { ConnectionSummary, TreeTable } from '../../src/api/types'

afterEach(cleanup)

const connections: ConnectionSummary[] = [
  { name: 'prod', system: 'postgresql', isDefault: true },
  { name: 'staging', system: 'mysql', isDefault: false },
]
const tree: TreeTable[] = [{ name: 'users', type: 'table' }, { name: 'v_active', type: 'view' }]

function setup(over: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const calls = { select: [] as string[], insert: [] as string[], open: [] as Array<[string, string]> }
  render(
    <Sidebar
      connections={connections}
      activeConnectionId="prod"
      tree={tree}
      onSelectConnection={(id) => calls.select.push(id)}
      onInsertSelect={(t) => calls.insert.push(t)}
      onAddConnection={() => {}}
      onEditConnection={() => {}}
      onDeleteConnection={() => {}}
      onOpenTable={(t, sub) => calls.open.push([t, sub])}
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

test('clicking a table name opens its table tab (structure)', () => {
  const calls = setup()
  fireEvent.click(screen.getByText('v_active'))
  expect(calls.open).toContainEqual(['v_active', 'structure'])
})

test('clicking the pencil opens the table tab in content mode', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: '編輯資料 users' }))
  expect(calls.open).toContainEqual(['users', 'content'])
})

test('renders the 預設 badge for the default connection', () => {
  setup()
  expect(screen.getByText('預設')).toBeDefined()
})

test('the insert-select button calls onInsertSelect', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: /查詢 users/ }))
  expect(calls.insert).toEqual(['users'])
})

test('typing in the schema search box filters the table list', () => {
  setup()
  fireEvent.change(screen.getByRole('searchbox', { name: '搜尋資料表' }), { target: { value: 'user' } })
  expect(screen.getByText('users')).toBeDefined()
  expect(screen.queryByText('v_active')).toBeNull()
})

test('header + button triggers onAddConnection', () => {
  const onAdd = mock(() => {})
  render(<Sidebar connections={[{ name: 'primary', system: 'mysql', isDefault: true }]}
    activeConnectionId={null} tree={[]}
    onSelectConnection={() => {}} onInsertSelect={() => {}}
    onAddConnection={onAdd} onEditConnection={() => {}} onDeleteConnection={() => {}} onOpenTable={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '新增連線' }))
  expect(onAdd).toHaveBeenCalledTimes(1)
})

test('per-connection edit / delete buttons fire with the name', () => {
  const onEdit = mock((_: string) => {}); const onDelete = mock((_: string) => {})
  render(<Sidebar connections={[{ name: 'primary', system: 'mysql', isDefault: true }]}
    activeConnectionId={null} tree={[]}
    onSelectConnection={() => {}} onInsertSelect={() => {}}
    onAddConnection={() => {}} onEditConnection={onEdit} onDeleteConnection={onDelete} onOpenTable={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '編輯連線 primary' }))
  fireEvent.click(screen.getByRole('button', { name: '刪除連線 primary' }))
  expect(onEdit).toHaveBeenCalledWith('primary')
  expect(onDelete).toHaveBeenCalledWith('primary')
})
