import type { TableSchemaDto } from '../api/types'

// Structural keywords that mean the result rows do not map 1:1 onto a single base
// table's rows (joins, set operations, aggregation, distinct) — editing such a result
// is unsafe, so we bail out to read-only.
const UNSAFE = /\b(join|union|intersect|except|distinct|having)\b|\bgroup\s+by\b/i

// Clause keywords that legitimately follow the table name. The FROM segment ends at
// the first of these (or end of statement).
const CLAUSE_END = /\b(where|group|having|order|limit|offset|union|window|for)\b/i

// A bare or schema-qualified identifier, each part optionally backtick/double-quoted.
const IDENT = /^(?:`([^`]+)`|"([^"]+)"|([A-Za-z_][\w$]*))(?:\.(?:`([^`]+)`|"([^"]+)"|([A-Za-z_][\w$]*)))?$/

function unquotePart(...groups: (string | undefined)[]): string {
  return groups.find((g) => g !== undefined) ?? ''
}

/**
 * Detect whether `sql` is a plain single-table SELECT and, if so, return that table's
 * (optionally schema-qualified) name. Returns null for anything that cannot be safely
 * round-tripped back to a single base table: joins, comma-joins, subqueries, set
 * operations, aggregation, DISTINCT, CTEs, table aliases, or non-SELECT statements.
 *
 * Limitation: string literals and comments are NOT stripped, so SQL whose literals or
 * comments contain keywords like `from`/`join` is conservatively rejected (fail closed —
 * stays read-only). This errs toward false negatives, never a false positive that could
 * route edits to the wrong table.
 */
export function detectSingleTable(sql: string): string | null {
  const trimmed = sql.trim().replace(/;\s*$/, '')
  if (trimmed === '') return null
  if (!/^select\b/i.test(trimmed)) return null
  if (UNSAFE.test(trimmed)) return null

  // Exactly one FROM. Two+ means a subquery (in the select list or FROM) or a set op.
  const fromMatches = trimmed.match(/\bfrom\b/gi)
  if (!fromMatches || fromMatches.length !== 1) return null

  const fromIdx = trimmed.search(/\bfrom\b/i)
  const afterFrom = trimmed.slice(fromIdx + 4)
  const endMatch = afterFrom.search(CLAUSE_END)
  const segment = (endMatch === -1 ? afterFrom : afterFrom.slice(0, endMatch)).trim()

  // A comma-join, parenthesised subquery, or "table alias" form leaves more than one
  // whitespace-delimited token (or a comma) in the segment — reject all of them.
  if (segment === '' || segment.includes(',') || /\s/.test(segment) || segment.includes('(')) {
    return null
  }

  const m = segment.match(IDENT)
  if (!m) return null
  const schemaPart = unquotePart(m[1], m[2], m[3])
  const tablePart = unquotePart(m[4], m[5], m[6])
  return tablePart === '' ? schemaPart : `${schemaPart}.${tablePart}`
}

/**
 * A detected single-table result is editable only when the table has a primary key and
 * every PK column is present in the result fields (so each row can be addressed for
 * UPDATE/DELETE). Computed/aliased columns naturally fail this gate.
 */
export function resultIsEditable(schema: TableSchemaDto, fields: string[]): boolean {
  const pk = schema.primaryKey ?? []
  return pk.length > 0 && pk.every((col) => fields.includes(col))
}
