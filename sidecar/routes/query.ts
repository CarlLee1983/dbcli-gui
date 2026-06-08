import { QueryExecutor, BlacklistManager, BlacklistValidator } from '@carllee1983/dbcli/core'
import type { ConnectionPool } from '../connection-pool'
import { QueryBody } from '../../shared/schemas'
import { toErrorBody } from '../../shared/errors'
import { json } from '../http'

const DEFAULT_LIMIT = 1000
const CLIENT_ERROR_CODES = new Set(['PERMISSION', 'BLACKLISTED'])

export function makeQueryHandler(pool: ConnectionPool) {
  return async function query(req: Request): Promise<Response> {
    const parsed = QueryBody.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId + sql required' } }, 400)

    const entry = pool.get(parsed.data.connectionId)
    if (!entry) return json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409)

    try {
      const validator = new BlacklistValidator(new BlacklistManager(entry.config))
      // v1: force query-only regardless of the connection's configured permission.
      const executor = new QueryExecutor(entry.adapter, 'query-only', validator, entry.config)
      const result = await executor.execute(parsed.data.sql, {
        autoLimit: true,
        limitValue: parsed.data.limit ?? DEFAULT_LIMIT,
      })
      return json({ rows: result.rows, rowCount: result.rowCount })
    } catch (err) {
      const body = toErrorBody(err)
      const status = CLIENT_ERROR_CODES.has(body.error.code) ? 403 : 500
      return json(body, status)
    }
  }
}
