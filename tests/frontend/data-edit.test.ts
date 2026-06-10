import { test, expect } from 'bun:test'
import { rowKeyOf, pendingCount, buildMutateOps, emptyEdits, reduceEdits } from '../../src/hooks/data-edit'

const PK = ['id']
const rows = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]
const byKey = Object.fromEntries(rows.map((r) => [rowKeyOf(r, PK), r]))

test('rowKeyOf is stable for the same pk values', () => {
  expect(rowKeyOf({ id: 1, name: 'z' }, PK)).toBe(rowKeyOf({ id: 1, name: 'a' }, PK))
})

test('setCell accumulates an update; pendingCount reflects it', () => {
  let e = emptyEdits()
  e = reduceEdits(e, { type: 'setCell', key: rowKeyOf(rows[0]!, PK), field: 'name', value: 'x' })
  expect(pendingCount(e)).toBe(1)
  const ops = buildMutateOps(e, byKey, PK)
  expect(ops.updates).toEqual([{ pk: { id: 1 }, set: { name: 'x' } }])
})

test('two edits to the same row merge into one update', () => {
  let e = emptyEdits()
  const k = rowKeyOf(rows[0]!, PK)
  e = reduceEdits(e, { type: 'setCell', key: k, field: 'name', value: 'x' })
  e = reduceEdits(e, { type: 'setCell', key: k, field: 'name', value: 'y' })
  expect(pendingCount(e)).toBe(1)
  expect(buildMutateOps(e, byKey, PK).updates[0]!.set).toEqual({ name: 'y' })
})

test('toggleDelete adds then removes a delete', () => {
  let e = emptyEdits()
  const k = rowKeyOf(rows[1]!, PK)
  e = reduceEdits(e, { type: 'toggleDelete', key: k })
  expect(buildMutateOps(e, byKey, PK).deletes).toEqual([{ pk: { id: 2 } }])
  e = reduceEdits(e, { type: 'toggleDelete', key: k })
  expect(pendingCount(e)).toBe(0)
})

test('insert draft flows into ops.inserts', () => {
  let e = emptyEdits()
  e = reduceEdits(e, { type: 'addInsert' })
  e = reduceEdits(e, { type: 'setInsertCell', index: 0, field: 'name', value: 'new' })
  expect(buildMutateOps(e, byKey, PK).inserts).toEqual([{ values: { name: 'new' } }])
})

test('null value is preserved through ops', () => {
  let e = emptyEdits()
  e = reduceEdits(e, { type: 'setCell', key: rowKeyOf(rows[0]!, PK), field: 'name', value: null })
  expect(buildMutateOps(e, byKey, PK).updates[0]!.set).toEqual({ name: null })
})
