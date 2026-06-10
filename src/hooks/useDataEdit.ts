import { useReducer } from 'react'
import { emptyEdits, reduceEdits, type EditAction, type PendingEdits } from './data-edit'

export interface DataEditApi {
  edits: PendingEdits
  setCell(key: string, field: string, value: unknown): void
  toggleDelete(key: string): void
  addInsert(): void
  setInsertCell(index: number, field: string, value: unknown): void
  removeInsert(index: number): void
  reset(): void
}

export function useDataEdit(): DataEditApi {
  const [edits, dispatch] = useReducer((s: PendingEdits, a: EditAction) => reduceEdits(s, a), undefined, emptyEdits)
  return {
    edits,
    setCell: (key, field, value) => dispatch({ type: 'setCell', key, field, value }),
    toggleDelete: (key) => dispatch({ type: 'toggleDelete', key }),
    addInsert: () => dispatch({ type: 'addInsert' }),
    setInsertCell: (index, field, value) => dispatch({ type: 'setInsertCell', index, field, value }),
    removeInsert: (index) => dispatch({ type: 'removeInsert', index }),
    reset: () => dispatch({ type: 'reset' }),
  }
}
