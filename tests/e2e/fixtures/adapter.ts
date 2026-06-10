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
      const verb = sql.trim().split(/\s+/)[0]?.toUpperCase()
      if (verb === 'INSERT' || verb === 'UPDATE' || verb === 'DELETE') {
        // Fixture does not persist; report one affected row so the route's
        // optimistic-concurrency check passes and the transaction commits.
        return { rows: [], affectedRows: 1 } as ExecutionResult<T>
      }
      if (sql.includes('information_schema.TRIGGERS') || sql.includes('information_schema.triggers')) {
        return { rows: [{ name: 'trg_demo', timing: 'AFTER', event: 'INSERT', statement: 'BEGIN END' }] as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
      }
      if (sql.includes('KEY_COLUMN_USAGE') || sql.includes('constraint_column_usage')) {
        return { rows: [{ fromTable: 'order_items', fromColumn: 'order_id', toColumn: 'id', constraintName: 'fk_oi' }] as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
      }
      if (sql.startsWith('SHOW CREATE TABLE')) {
        return { rows: [{ Table: 'orders', 'Create Table': 'CREATE TABLE `orders` (...)' }] as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
      }
      if (sql.includes('pg_class') || sql.includes('information_schema.TABLES')) {
        return { rows: [{ engine: 'InnoDB', rowCount: 3, sizeBytes: 16384, collation: 'utf8mb4_general_ci', createdAt: '2024-01-01' }] as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
      }
      // plain SELECT → seed rows
      const t = tables.find((tb) => new RegExp(`\\b${tb.name}\\b`).test(sql))
      return { rows: (t?.rows ?? []) as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
    },
  }
}
