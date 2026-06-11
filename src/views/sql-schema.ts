/**
 * Build the schema map @codemirror/lang-sql consumes for completion. Table names become
 * completion entries; columns (when known) attach per table. Empty column lists still
 * register the table name so `FROM <tab>` completes.
 */
export function buildSqlSchema(
  tables: string[],
  columnsByTable: Record<string, string[]> = {},
): Record<string, string[]> {
  const schema: Record<string, string[]> = {}
  for (const t of tables) schema[t] = columnsByTable[t] ?? []
  return schema
}
