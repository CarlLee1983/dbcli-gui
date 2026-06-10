import { test, expect } from 'bun:test'
import { filterRows } from '../../src/views/row-filter'
import { sortRows } from '../../src/views/grid-virtual'

const rows = [
  { id: 1, label: 'Apple', meta: { tag: 'fruit' } },
  { id: 2, label: 'banana', meta: null },
  { id: 3, label: 'Cherry', meta: { tag: 'red' } },
]
const fields = ['id', 'label', 'meta']

test('empty query returns all rows', () => {
  expect(filterRows(rows, fields, '')).toEqual(rows)
})

test('case-insensitive substring across any field', () => {
  expect(filterRows(rows, fields, 'APP').map((r) => r.id)).toEqual([1])
})

test('matches numeric value coerced to string', () => {
  expect(filterRows(rows, fields, '2').map((r) => r.id)).toEqual([2])
})

test('matches inside JSON-stringified object cell', () => {
  expect(filterRows(rows, fields, 'red').map((r) => r.id)).toEqual([3])
})

test('null/undefined cells never match', () => {
  expect(filterRows(rows, fields, 'null')).toEqual([])
})

// Mirrors ResultGrid's useMemo: sort is applied to the filtered subset, not all rows.
test('filter then sort orders only the matching subset', () => {
  const data = [
    { id: 3, label: 'apple' },
    { id: 1, label: 'apricot' },
    { id: 2, label: 'banana' },
  ]
  const f = ['id', 'label']
  const sorted = sortRows(filterRows(data, f, 'ap'), 'id', 'asc')
  expect(sorted.map((r) => r.id)).toEqual([1, 3])
})

test('empty filter then sort orders all rows', () => {
  const data = [
    { id: 2, label: 'b' },
    { id: 1, label: 'a' },
  ]
  const f = ['id', 'label']
  const sorted = sortRows(filterRows(data, f, ''), 'id', 'desc')
  expect(sorted.map((r) => r.id)).toEqual([2, 1])
})
