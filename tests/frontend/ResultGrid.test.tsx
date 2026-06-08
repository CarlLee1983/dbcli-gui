import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ResultGrid } from '../../src/views/ResultGrid'
import type { QueryResultDto } from '../../src/api/types'

afterEach(cleanup)

const small: QueryResultDto = {
  fields: ['id', 'name'],
  rows: [{ id: 2, name: 'b' }, { id: 1, name: 'a' }],
  rowCount: 2,
  ms: 7,
}

test('renders headers from fields', () => {
  render(<ResultGrid result={small} />)
  expect(screen.getByText('id')).toBeDefined()
  expect(screen.getByText('name')).toBeDefined()
})

test('renders cell values', () => {
  render(<ResultGrid result={small} />)
  expect(screen.getByText('a')).toBeDefined()
  expect(screen.getByText('b')).toBeDefined()
})

test('footer shows rowCount and ms', () => {
  render(<ResultGrid result={small} />)
  const footer = screen.getByText(/列/)
  expect(footer.textContent).toContain('2')
  expect(footer.textContent).toContain('7 ms')
})

test('clicking a header sorts ascending by that column', () => {
  render(<ResultGrid result={small} />)
  fireEvent.click(screen.getByText('id'))
  const cells = screen.getAllByRole('cell').filter((c) => c.getAttribute('data-col') === 'id')
  expect(cells[0]!.textContent).toBe('1')
})

test('clicking a header cycles asc → desc → unsorted', () => {
  render(<ResultGrid result={small} />)
  const header = screen.getByText('id')
  const firstIdCell = () => screen.getAllByRole('cell').filter((c) => c.getAttribute('data-col') === 'id')[0]!
  fireEvent.click(header)
  expect(firstIdCell().textContent).toBe('1')
  expect(header.textContent).toMatch(/▲/)
  fireEvent.click(header)
  expect(firstIdCell().textContent).toBe('2')
  expect(header.textContent).toMatch(/▼/)
  fireEvent.click(header)
  expect(header.textContent).not.toMatch(/[▲▼]/)
})

test('shows an empty-state hint when result is null', () => {
  render(<ResultGrid result={null} />)
  expect(screen.getByText(/尚無結果/)).toBeDefined()
})

test('large result only renders a window of rows, not all', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i }))
  const big: QueryResultDto = { fields: ['id'], rows, rowCount: 5000, ms: 1 }
  render(<ResultGrid result={big} />)
  const cells = screen.getAllByRole('cell').filter((c) => c.getAttribute('data-col') === 'id')
  expect(cells.length).toBeLessThan(200)
})
