import { QueryExecutor, BlacklistManager, BlacklistValidator } from '@carllee1983/dbcli/core'
import type { ConnectionPool } from '../connection-pool'
import { ExportBody } from '../../shared/schemas'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { json } from '../http'

const DEFAULT_LIMIT = 10000 // exports allow more rows than the interactive grid

/** Serialize rows to CSV with RFC-4180 field quoting, LF-delimited. */
export function toCsv(columnNames: string[], rows: Array<Record<string, unknown>>): string {
  if (columnNames.length === 0) return ''
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columnNames.map(escape).join(',')
  const body = rows.map((row) => columnNames.map((c) => escape(row[c])).join(','))
  return [header, ...body].join('\n')
}

export function makeExportHandler(pool: ConnectionPool) {
  return async function exportRows(req: Request): Promise<Response> {
    const parsed = ExportBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId + sql + format required' } }, 400)

    const entry = pool.get(parsed.data.connectionId)
    if (!entry) return json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409)

    try {
      const validator = new BlacklistValidator(new BlacklistManager(entry.config))
      // Force query-only, same as /query — exports never write.
      const executor = new QueryExecutor(entry.adapter, 'query-only', validator, entry.config)
      const result = await executor.execute(parsed.data.sql, {
        autoLimit: true,
        limitValue: parsed.data.limit ?? DEFAULT_LIMIT,
      })

      if (parsed.data.format === 'json') {
        return new Response(JSON.stringify(result.rows), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-disposition': 'attachment; filename="export.json"',
          },
        })
      }
      const csv = toCsv(result.columnNames, result.rows)
      return new Response(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="export.csv"',
        },
      })
    } catch (err) {
      const body = toErrorBody(err)
      return json(body, statusForCode(body.error.code))
    }
  }
}
