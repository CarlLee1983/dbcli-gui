/** Case-insensitive substring match against any field's rendered value. Empty query → all. */
export function filterRows<T extends Record<string, unknown>>(rows: T[], fields: string[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (q === '') return rows
  return rows.filter((row) =>
    fields.some((f) => {
      const v = row[f]
      if (v === null || v === undefined) return false
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return s.toLowerCase().includes(q)
    }),
  )
}
