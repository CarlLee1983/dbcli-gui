import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HistoryPanel } from '../../src/views/HistoryPanel'
import type { HistoryEntry } from '../../src/hooks/useHistory'

afterEach(cleanup)

const entries: HistoryEntry[] = [
  { sql: 'SELECT * FROM orders', connectionId: 'main', ts: 1000, rowCount: 3 },
  { sql: 'SELECT * FROM users', connectionId: 'replica', ts: 500, rowCount: 2 },
]

function setup() {
  const picks: string[] = []
  let cleared = 0
  render(<HistoryPanel entries={entries} now={2000} onPick={(sql) => picks.push(sql)} onClear={() => { cleared++ }} />)
  return { picks, getCleared: () => cleared }
}

test('renders each entry with its connection tag', () => {
  setup()
  expect(screen.getByText('SELECT * FROM orders')).toBeDefined()
  expect(screen.getByText('main')).toBeDefined()
  expect(screen.getByText('replica')).toBeDefined()
})

test('clicking an entry calls onPick with its sql', () => {
  const { picks } = setup()
  fireEvent.click(screen.getByText('SELECT * FROM users'))
  expect(picks).toEqual(['SELECT * FROM users'])
})

test('empty state when no entries', () => {
  render(<HistoryPanel entries={[]} now={0} onPick={() => {}} onClear={() => {}} />)
  expect(screen.getByText('尚無查詢歷史')).toBeDefined()
})

test('clear button calls onClear', () => {
  const { getCleared } = setup()
  fireEvent.click(screen.getByRole('button', { name: '清除歷史' }))
  expect(getCleared()).toBe(1)
})
