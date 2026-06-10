import { test, expect } from 'bun:test'
import { MutateBody } from '../../shared/schemas'

test('accepts a well-formed batch', () => {
  const r = MutateBody.safeParse({
    connectionId: 'main', table: 'users',
    ops: {
      updates: [{ pk: { id: 1 }, set: { name: 'a' } }],
      inserts: [{ values: { name: 'b' } }],
      deletes: [{ pk: { id: 2 } }],
    },
  })
  expect(r.success).toBe(true)
})

test('defaults missing op arrays to empty', () => {
  const r = MutateBody.safeParse({ connectionId: 'main', table: 'users', ops: {} })
  expect(r.success).toBe(true)
  if (r.success) {
    expect(r.data.ops.updates).toEqual([])
    expect(r.data.ops.inserts).toEqual([])
    expect(r.data.ops.deletes).toEqual([])
  }
})

test('rejects empty table', () => {
  const r = MutateBody.safeParse({ connectionId: 'main', table: '', ops: {} })
  expect(r.success).toBe(false)
})
