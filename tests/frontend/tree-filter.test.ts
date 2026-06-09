import { test, expect } from 'bun:test'
import { filterTree } from '../../src/views/tree-filter'
import type { TreeTable } from '../../src/api/types'

const tree: TreeTable[] = [
  { name: 'orders', type: 'table' },
  { name: 'order_items', type: 'table' },
  { name: 'users', type: 'table' },
  { name: 'v_active', type: 'view' },
]

test('empty query returns the whole tree', () => {
  expect(filterTree(tree, '')).toEqual(tree)
  expect(filterTree(tree, '   ')).toEqual(tree)
})

test('case-insensitive substring match on table name', () => {
  expect(filterTree(tree, 'ORDER').map((t) => t.name)).toEqual(['orders', 'order_items'])
})

test('no match returns empty array', () => {
  expect(filterTree(tree, 'zzz')).toEqual([])
})
