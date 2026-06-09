import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ResultGrid } from '../../src/views/ResultGrid'
import type { QueryResultDto } from '../../src/api/types'

afterEach(cleanup)

const noop = () => {}

const small: QueryResultDto = {
  fields: ['id', 'name'],
  rows: [{ id: 2, name: 'b' }, { id: 1, name: 'a' }],
  rowCount: 2,
  ms: 7,
}

test('renders headers from fields', () => {
  render(<ResultGrid result={small} filter="" sortField={null} sortDir={null} onFilterChange={noop} onSort={noop} />)
  expect(screen.getByText('id')).toBeDefined()
  expect(screen.getByText('name')).toBeDefined()
})

test('renders cell values', () => {
  render(<ResultGrid result={small} filter="" sortField={null} sortDir={null} onFilterChange={noop} onSort={noop} />)
  expect(screen.getByText('a')).toBeDefined()
  expect(screen.getByText('b')).toBeDefined()
})

test('footer shows rowCount and ms', () => {
  render(<ResultGrid result={small} filter="" sortField={null} sortDir={null} onFilterChange={noop} onSort={noop} />)
  const footer = screen.getByText(/列/)
  expect(footer.textContent).toContain('2')
  expect(footer.textContent).toContain('7 ms')
})

test('shows an empty-state hint when result is null', () => {
  render(<ResultGrid result={null} filter="" sortField={null} sortDir={null} onFilterChange={noop} onSort={noop} />)
  expect(screen.getByText(/尚無結果/)).toBeDefined()
})

test('large result only renders a window of rows, not all', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i }))
  const big: QueryResultDto = { fields: ['id'], rows, rowCount: 5000, ms: 1 }
  render(<ResultGrid result={big} filter="" sortField={null} sortDir={null} onFilterChange={noop} onSort={noop} />)
  const cells = screen.getAllByRole('cell').filter((c) => c.getAttribute('data-col') === 'id')
  expect(cells.length).toBeLessThan(200)
})

test('result search box calls onFilterChange (controlled)', () => {
  const calls: string[] = []
  render(
    <ResultGrid
      result={{ rows: [{ id: 1, label: 'apple' }], fields: ['id', 'label'], rowCount: 1, ms: 1 }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={(q) => calls.push(q)}
      onSort={() => {}}
    />,
  )
  fireEvent.change(screen.getByRole('searchbox', { name: '搜尋結果' }), { target: { value: 'app' } })
  expect(calls).toEqual(['app'])
})

test('applies the controlled filter to rows', () => {
  render(
    <ResultGrid
      result={{ rows: [{ id: 1, label: 'apple' }, { id: 2, label: 'banana' }], fields: ['id', 'label'], rowCount: 2, ms: 1 }}
      filter="app"
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={() => {}}
    />,
  )
  expect(screen.getByText('apple')).toBeDefined()
  expect(screen.queryByText('banana')).toBeNull()
})

test('clicking a header calls onSort with the field', () => {
  const calls: string[] = []
  render(
    <ResultGrid
      result={{ rows: [{ id: 1 }], fields: ['id'], rowCount: 1, ms: 1 }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={(f) => calls.push(f)}
    />,
  )
  fireEvent.click(screen.getByText('id'))
  expect(calls).toEqual(['id'])
})

test('clicking a cell still opens the detail modal', () => {
  render(
    <ResultGrid
      result={{ rows: [{ id: 1, label: 'apple' }], fields: ['id', 'label'], rowCount: 1, ms: 1 }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={() => {}}
    />,
  )
  fireEvent.click(screen.getByText('apple'))
  expect(screen.getByRole('dialog', { name: /label 內容/ })).toBeDefined()
})
