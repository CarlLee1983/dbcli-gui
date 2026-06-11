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
      // plain SELECT → seed rows, honouring a trailing ORDER BY <col> [ASC|DESC] so the
      // content sub-tab's server-side sort can be exercised end-to-end.
      const t = tables.find((tb) => new RegExp(`\\b${tb.name}\\b`).test(sql))
      let rows = [...(t?.rows ?? [])]
      // Minimal `col LIKE '%v%'` / `col = 'v'` support so the content filter bar visibly narrows
      // rows end-to-end (the fixture ignores other operators).
      const like = /WHERE\s+(\w+)\s+LIKE\s+'%(.*?)%'/i.exec(sql)
      const eq = /WHERE\s+(\w+)\s*=\s*'(.*?)'/i.exec(sql)
      if (like) {
        const [, col, needle] = like
        rows = rows.filter((r) => String(r[col as string] ?? '').includes(needle as string))
      } else if (eq) {
        const [, col, want] = eq
        rows = rows.filter((r) => String(r[col as string] ?? '') === want)
      }
      // COUNT(*) AS total → the pager's total.
      if (/COUNT\(\*\)/i.test(sql)) {
        return { rows: [{ total: rows.length }] as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
      }
      const order = /ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?/i.exec(sql)
      if (order) {
        const col = order[1] as string
        const desc = (order[2] ?? 'ASC').toUpperCase() === 'DESC'
        rows.sort((a, b) => {
          const av = a[col]
          const bv = b[col]
          if (av === bv) return 0
          const cmp = (av as number | string) < (bv as number | string) ? -1 : 1
          return desc ? -cmp : cmp
        })
      }
      return { rows: rows as unknown as T[], affectedRows: 0 } as ExecutionResult<T>
    },
  }
}
