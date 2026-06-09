import { ConnectionError } from '@carllee1983/dbcli/core'
import type { DatabaseAdapter, ExecutionResult, TableSchema } from '@carllee1983/dbcli/core'
import { FORCE_ERROR, type SeedTable } from './data'

/**
 * A fake DatabaseAdapter that answers from a seed dataset. The real QueryExecutor
 * derives columnNames from Object.keys(rows[0]) and applies the column blacklist via
 * filterColumns, so execute() only needs to return the right rows.
 */
export function fixtureAdapter(tables: SeedTable[]): DatabaseAdapter {
  return {
    connect: async () => {},
    disconnect: async () => {},
    testConnection: async () => true,
    getServerVersion: async () => 'fixture-1.0',
    listTables: async () =>
      tables.map((t) => ({
        name: t.name,
        columns: [],
        tableType: t.type,
        columnCount: t.columns.length,
        estimatedRowCount: t.rows.length,
      })) as TableSchema[],
    getTableSchema: async (name: string) => {
      const t = tables.find((tb) => tb.name === name)
      if (!t) throw new ConnectionError('TABLE_NOT_FOUND', `no such table: ${name}`, [])
      return {
        name: t.name,
        columns: t.columns.map((c) => ({ ...c })),
        primaryKey: t.columns.filter((c) => c.primaryKey).map((c) => c.name),
      } as TableSchema
    },
    execute: async <T>(sql: string) => {
      if (sql.includes(FORCE_ERROR)) {
        throw new ConnectionError('ECONNREFUSED', 'fixture forced failure', [])
      }
      // Resolve the seed table whose name appears in the SQL; default to no rows.
      const t = tables.find((tb) => new RegExp(`\\b${tb.name}\\b`).test(sql))
      return { rows: (t?.rows ?? []) as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
    },
  }
}
