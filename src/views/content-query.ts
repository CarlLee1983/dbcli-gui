import type { SortDir } from './grid-virtual'
import type { QueryResultDto } from '../api/types'

/**
 * Content-view query builders for the table browser's filter bar + pagination.
 *
 * SECURITY NOTE — the client only exposes raw-SQL `query()` (no bound parameters), so the
 * filter VALUE is the one piece of free user input that reaches the SQL string. It is always
 * wrapped in a single-quoted string literal with SQL-standard quote doubling (`'` → `''`),
 * which is the correct escape for MySQL/MariaDB/PostgreSQL string literals. The column and
 * operator are NOT free input — the column comes from the table schema and the operator from
 * {@link FILTER_OPS} — so they are interpolated unquoted, matching the existing FROM/ORDER BY
 * convention in this codebase.
 */

export type FilterOp =
  | '=' | '!=' | '<' | '<=' | '>' | '>='
  | 'contains' | 'starts' | 'ends' | 'LIKE'
  | 'IS NULL' | 'IS NOT NULL'

export interface ContentFilter {
  column: string
  op: FilterOp
  value: string
}

/** Operators offered in the filter bar; `unary` ops take no value (IS NULL / IS NOT NULL). */
export const FILTER_OPS: Array<{ value: FilterOp; label: string; unary?: boolean }> = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: 'contains', label: '包含' },
  { value: 'starts', label: '開頭為' },
  { value: 'ends', label: '結尾為' },
  { value: 'LIKE', label: 'LIKE' },
  { value: 'IS NULL', label: '為 NULL', unary: true },
  { value: 'IS NOT NULL', label: '非 NULL', unary: true },
]

export const DEFAULT_PAGE_SIZE = 200

const UNARY_OPS = new Set<FilterOp>(['IS NULL', 'IS NOT NULL'])

export function isUnaryOp(op: FilterOp): boolean {
  return UNARY_OPS.has(op)
}

/** Wrap a value as a single-quoted SQL string literal, doubling embedded quotes. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Build a WHERE clause (without leading space) for an active content filter.
 * Returns '' when there is no filter, or when a value-bearing operator has an empty value
 * (an inactive filter rather than an accidental `= ''`).
 */
export function buildWhere(filter: ContentFilter | null | undefined): string {
  if (!filter) return ''
  const { column, op } = filter
  if (isUnaryOp(op)) return `WHERE ${column} ${op}`
  const value = filter.value
  if (value.trim() === '') return ''
  switch (op) {
    case 'contains':
      return `WHERE ${column} LIKE ${quote(`%${value}%`)}`
    case 'starts':
      return `WHERE ${column} LIKE ${quote(`${value}%`)}`
    case 'ends':
      return `WHERE ${column} LIKE ${quote(`%${value}`)}`
    case 'LIKE':
      return `WHERE ${column} LIKE ${quote(value)}`
    default:
      // =, !=, <, <=, >, >= — the operator is a fixed enum member, safe to interpolate.
      return `WHERE ${column} ${op} ${quote(value)}`
  }
}

export interface BrowseParams {
  sortField?: string | null
  sortDir?: SortDir
  filter?: ContentFilter | null
  page?: number
  pageSize?: number
}

/**
 * Full-table browse SQL: `SELECT * FROM table [WHERE …] [ORDER BY …] LIMIT n [OFFSET …]`.
 * Page 0 omits OFFSET so a plain browse matches the legacy `… LIMIT 200` string exactly.
 * `table` and `sortField` are server-enumerated identifiers, interpolated unquoted.
 */
export function buildBrowseSql(table: string, params: BrowseParams = {}): string {
  const { sortField = null, sortDir = null, filter = null, page = 0, pageSize = DEFAULT_PAGE_SIZE } = params
  const where = buildWhere(filter)
  const order = sortField && sortDir ? `ORDER BY ${sortField} ${sortDir === 'desc' ? 'DESC' : 'ASC'}` : ''
  const offset = page > 0 ? `OFFSET ${page * pageSize}` : ''
  return ['SELECT * FROM', table, where, order, `LIMIT ${pageSize}`, offset].filter(Boolean).join(' ')
}

/** COUNT(*) for the current filter, so the pager can show total rows. */
export function buildCountSql(table: string, filter: ContentFilter | null | undefined): string {
  const where = buildWhere(filter)
  return ['SELECT COUNT(*) AS total FROM', table, where].filter(Boolean).join(' ')
}

/** Read the `total` column from a COUNT result; null when missing/unparseable. */
export function parseTotal(result: QueryResultDto): number | null {
  const raw = result.rows[0]?.total
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}
