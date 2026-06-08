export type SortDir = 'asc' | 'desc' | null

export interface VisibleRangeInput {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  rowCount: number
  overscan: number
}

export interface VisibleRange {
  start: number
  end: number
  topPad: number
  bottomPad: number
}

/** Which row indices to actually render, plus spacer heights above/below. */
export function computeVisibleRange(input: VisibleRangeInput): VisibleRange {
  const { scrollTop, viewportHeight, rowHeight, rowCount, overscan } = input
  const first = Math.floor(scrollTop / rowHeight)
  const visibleCount = Math.ceil(viewportHeight / rowHeight)
  const start = Math.max(0, first - overscan)
  const end = Math.min(rowCount, first + visibleCount + overscan)
  return {
    start,
    end,
    topPad: start * rowHeight,
    bottomPad: Math.max(0, (rowCount - end) * rowHeight),
  }
}

/** Three-state cycle for clicking a column header. */
export function nextSortDir(current: SortDir): SortDir {
  if (current === null) return 'asc'
  if (current === 'asc') return 'desc'
  return null
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

/** Returns a NEW array. With dir=null, preserves original order. */
export function sortRows<T extends Record<string, unknown>>(rows: T[], field: string, dir: SortDir): T[] {
  if (dir === null) return [...rows]
  const sorted = [...rows].sort((ra, rb) => compareValues(ra[field], rb[field]))
  return dir === 'desc' ? sorted.reverse() : sorted
}
