import { test, expect, afterEach, beforeEach, mock } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ResultGrid } from '../../src/views/ResultGrid'
import type { QueryResultDto } from '../../src/api/types'

const noop = () => {}
const result: QueryResultDto = {
  fields: ['id', 'name'],
  rows: [{ id: 1, name: 'alice' }],
  rowCount: 1,
  ms: 1,
}

let writes: string[]
beforeEach(() => {
  writes = []
  // @ts-expect-error happy-dom navigator has no clipboard by default
  globalThis.navigator.clipboard = { writeText: mock(async (t: string) => { writes.push(t) }) }
})
afterEach(cleanup)

function openCellMenu() {
  render(<ResultGrid result={result} filter="" sortField={null} sortDir={null} onFilterChange={noop} onSort={noop} />)
  fireEvent.contextMenu(screen.getByText('alice'))
}

test('right-clicking a cell opens the copy menu', () => {
  openCellMenu()
  expect(screen.getByRole('menuitem', { name: '複製儲存格' })).toBeDefined()
  expect(screen.getByRole('menuitem', { name: '複製整列 (TSV)' })).toBeDefined()
  expect(screen.getByRole('menuitem', { name: '複製列為 CSV' })).toBeDefined()
})

test('複製儲存格 copies the cell value', () => {
  openCellMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: '複製儲存格' }))
  expect(writes).toEqual(['alice'])
})

test('複製整列 copies the row as TSV', () => {
  openCellMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: '複製整列 (TSV)' }))
  expect(writes).toEqual(['1\talice'])
})

test('selecting an item closes the menu', () => {
  openCellMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: '複製儲存格' }))
  expect(screen.queryByRole('menuitem', { name: '複製儲存格' })).toBeNull()
})
