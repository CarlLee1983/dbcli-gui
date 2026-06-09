import { test, expect } from 'bun:test'
import { filterRows } from '../../src/views/row-filter'

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
