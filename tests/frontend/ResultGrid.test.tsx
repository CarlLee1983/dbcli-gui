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
  const footer = screen.getByRole('contentinfo')
  expect(footer.textContent).toContain('2')
  expect(footer.textContent).toContain('7 ms')
})

test('renders a non-interactive row number column', () => {
  render(<ResultGrid result={small} filter="" sortField={null} sortDir={null} onFilterChange={noop} onSort={noop} />)
  expect(screen.getByRole('columnheader', { name: '#' })).toBeDefined()
  expect(screen.getByLabelText('第 1 列')).toBeDefined()
  expect(screen.getByLabelText('第 2 列')).toBeDefined()
})

test('shows filtered and total row counts when a filter is active', () => {
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
  expect(screen.getAllByText('顯示 1 / 共 2 列').length).toBeGreaterThan(0)
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

test('changing the result search resets the scroll container to top', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i, label: `row ${i}` }))
  render(
    <ResultGrid
      result={{ rows, fields: ['id', 'label'], rowCount: rows.length, ms: 1 }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={() => {}}
    />,
  )

  const scrollContainer = screen.getByRole('table').parentElement as HTMLDivElement
  scrollContainer.scrollTop = 280
  const scrollTo: HTMLDivElement['scrollTo'] = ((options?: ScrollToOptions | number) => {
    if (typeof options === 'object' && options?.top !== undefined) scrollContainer.scrollTop = Number(options.top)
  }) as HTMLDivElement['scrollTo']
  scrollContainer.scrollTo = scrollTo

  fireEvent.scroll(scrollContainer)
  fireEvent.change(screen.getByRole('searchbox', { name: '搜尋結果' }), { target: { value: 'row 1' } })

  expect(scrollContainer.scrollTop).toBe(0)
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

test('distinguishes filter-empty results from query-empty results', () => {
  render(
    <ResultGrid
      result={{ rows: [{ id: 1, label: 'apple' }], fields: ['id', 'label'], rowCount: 1, ms: 1 }}
      filter="missing"
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={() => {}}
    />,
  )
  expect(screen.getByText('沒有符合「missing」的資料')).toBeDefined()
  expect(screen.queryByText('查詢傳回 0 筆資料')).toBeNull()
})

test('shows the query-empty message when the result has no rows before filtering', () => {
  render(
    <ResultGrid
      result={{ rows: [], fields: ['id'], rowCount: 0, ms: 1 }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={() => {}}
    />,
  )
  expect(screen.getByText('查詢傳回 0 筆資料')).toBeDefined()
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
