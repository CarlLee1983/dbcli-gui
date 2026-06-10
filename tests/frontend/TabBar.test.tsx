import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TabBar } from '../../src/views/TabBar'
import { emptySession } from '../../src/hooks/tabs-reducer'

afterEach(cleanup)

const sessions = [
  { ...emptySession(1), title: '查詢 1' },
  { ...emptySession(2), title: '查詢 2' },
]

function setup() {
  const calls = { open: 0, close: [] as string[], active: [] as string[], rename: [] as Array<[string, string]> }
  render(
    <TabBar
      sessions={sessions}
      activeId="tab-1"
      onOpen={() => { calls.open++ }}
      onClose={(id) => calls.close.push(id)}
      onSetActive={(id) => calls.active.push(id)}
      onRename={(id, t) => calls.rename.push([id, t])}
    />,
  )
  return calls
}

test('renders a tab per session', () => {
  setup()
  expect(screen.getByText('查詢 1')).toBeDefined()
  expect(screen.getByText('查詢 2')).toBeDefined()
})

test('clicking a tab sets it active', () => {
  const calls = setup()
  fireEvent.click(screen.getByText('查詢 2'))
  expect(calls.active).toEqual(['tab-2'])
})

test('the + button opens a new tab', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: '開新分頁' }))
  expect(calls.open).toBe(1)
})

test('close button closes the tab', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: '關閉 查詢 2' }))
  expect(calls.close).toEqual(['tab-2'])
})

test('double-clicking a tab title opens a rename input and commits on blur', () => {
  const calls = setup()
  fireEvent.doubleClick(screen.getByText('查詢 1'))
  const input = screen.getByLabelText('重新命名 查詢 1') as HTMLInputElement
  fireEvent.change(input, { target: { value: '訂單分析' } })
  fireEvent.blur(input)
  expect(calls.rename).toEqual([['tab-1', '訂單分析']])
})

test('blurring with an empty value keeps the original title', () => {
  const calls = setup()
  fireEvent.doubleClick(screen.getByText('查詢 2'))
  const input = screen.getByLabelText('重新命名 查詢 2') as HTMLInputElement
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.blur(input)
  expect(calls.rename).toEqual([['tab-2', '查詢 2']])
})

test('pressing Enter in the rename input commits the new title', () => {
  const calls = setup()
  fireEvent.doubleClick(screen.getByText('查詢 1'))
  const input = screen.getByLabelText('重新命名 查詢 1') as HTMLInputElement
  fireEvent.change(input, { target: { value: '報表' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(calls.rename).toEqual([['tab-1', '報表']])
})
