import { test, expect } from 'bun:test'
import { computeVisibleRange, sortRows, nextSortDir } from '../../src/views/grid-virtual'

test('computeVisibleRange returns the slice around scrollTop with overscan', () => {
  const r = computeVisibleRange({ scrollTop: 1000, viewportHeight: 300, rowHeight: 20, rowCount: 1000, overscan: 5 })
  expect(r.start).toBe(45)
  expect(r.end).toBe(70)
  expect(r.topPad).toBe(45 * 20)
  expect(r.bottomPad).toBe((1000 - 70) * 20)
})

test('computeVisibleRange clamps to bounds', () => {
  const r = computeVisibleRange({ scrollTop: 0, viewportHeight: 300, rowHeight: 20, rowCount: 3, overscan: 5 })
  expect(r.start).toBe(0)
  expect(r.end).toBe(3)
  expect(r.bottomPad).toBe(0)
})

test('nextSortDir cycles none -> asc -> desc -> none', () => {
  expect(nextSortDir(null)).toBe('asc')
  expect(nextSortDir('asc')).toBe('desc')
  expect(nextSortDir('desc')).toBe(null)
})

test('sortRows sorts numbers ascending and descending', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }]
  expect(sortRows(rows, 'n', 'asc').map((r) => r.n)).toEqual([1, 2, 3])
  expect(sortRows(rows, 'n', 'desc').map((r) => r.n)).toEqual([3, 2, 1])
})

test('sortRows with null direction returns original order (new array)', () => {
  const rows = [{ n: 3 }, { n: 1 }]
  const out = sortRows(rows, 'n', null)
  expect(out).toEqual(rows)
  expect(out).not.toBe(rows)
})

test('sortRows compares strings via localeCompare', () => {
  const rows = [{ s: 'banana' }, { s: 'apple' }]
  expect(sortRows(rows, 's', 'asc').map((r) => r.s)).toEqual(['apple', 'banana'])
})

test('sortRows places null/undefined first on ascending', () => {
  const rows = [{ v: 2 }, { v: null }, { v: 1 }] as Array<Record<string, unknown>>
  expect(sortRows(rows, 'v', 'asc').map((r) => r.v)).toEqual([null, 1, 2])
})
