import type { MutateOps } from '../api/types'

export type { MutateOps }

export interface PendingEdits {
  updates: Record<string, Record<string, unknown>>
  inserts: Array<Record<string, unknown>>
  deletes: string[]
}

export const emptyEdits = (): PendingEdits => ({ updates: {}, inserts: [], deletes: [] })

export function rowKeyOf(row: Record<string, unknown>, primaryKey: string[]): string {
  return JSON.stringify(primaryKey.map((k) => row[k]))
}

export function pendingCount(e: PendingEdits): number {
  return Object.keys(e.updates).length + e.inserts.length + e.deletes.length
}

export function buildMutateOps(
  edits: PendingEdits,
  rowsByKey: Record<string, Record<string, unknown>>,
  primaryKey: string[],
): MutateOps {
  const pkOf = (row: Record<string, unknown>) => Object.fromEntries(primaryKey.map((k) => [k, row[k]]))
  return {
    // The filter guard ensures the row exists; the non-null assertion is safe.
    deletes: edits.deletes.filter((k) => !!rowsByKey[k]).map((k) => ({ pk: pkOf(rowsByKey[k]!) })),
    updates: Object.entries(edits.updates).filter(([k]) => !!rowsByKey[k]).map(([k, set]) => ({ pk: pkOf(rowsByKey[k]!), set })),
    inserts: edits.inserts.map((values) => ({ values })),
  }
}

export type EditAction =
  | { type: 'setCell'; key: string; field: string; value: unknown }
  | { type: 'toggleDelete'; key: string }
  | { type: 'addInsert' }
  | { type: 'setInsertCell'; index: number; field: string; value: unknown }
  | { type: 'removeInsert'; index: number }
  | { type: 'reset' }

export function reduceEdits(state: PendingEdits, action: EditAction): PendingEdits {
  switch (action.type) {
    case 'setCell':
      return { ...state, updates: { ...state.updates, [action.key]: { ...state.updates[action.key], [action.field]: action.value } } }
    case 'toggleDelete': {
      const has = state.deletes.includes(action.key)
      return { ...state, deletes: has ? state.deletes.filter((k) => k !== action.key) : [...state.deletes, action.key] }
    }
    case 'addInsert':
      return { ...state, inserts: [...state.inserts, {}] }
    case 'setInsertCell':
      return { ...state, inserts: state.inserts.map((row, i) => (i === action.index ? { ...row, [action.field]: action.value } : row)) }
    case 'removeInsert':
      return { ...state, inserts: state.inserts.filter((_, i) => i !== action.index) }
    case 'reset':
      return emptyEdits()
  }
}
