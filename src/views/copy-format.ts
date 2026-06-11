/** Clipboard formatters for the result / content grid context menu. Pure + unit-tested. */

/** A single cell's plain-text form: NULL/undefined → '', objects → JSON, else String(). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** Tab-separated row (spreadsheet paste). */
export function rowToTsv(row: Record<string, unknown>, fields: string[]): string {
  return fields.map((f) => cellText(row[f])).join('\t')
}

function csvField(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** RFC-4180-style CSV row. */
export function rowToCsv(row: Record<string, unknown>, fields: string[]): string {
  return fields.map((f) => csvField(cellText(row[f]))).join(',')
}

/** SQL literal for a value: NULL / number / TRUE-FALSE / quoted string (doubling quotes). */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return `'${text.replace(/'/g, "''")}'`
}

/** `INSERT INTO table (cols) VALUES (...);` for one row. */
export function rowToInsert(table: string, row: Record<string, unknown>, fields: string[]): string {
  const cols = fields.join(', ')
  const vals = fields.map((f) => sqlLiteral(row[f])).join(', ')
  return `INSERT INTO ${table} (${cols}) VALUES (${vals});`
}

/** Write text to the clipboard if the API is available (no-op in non-secure/headless contexts). */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard?.writeText?.(text)
}
