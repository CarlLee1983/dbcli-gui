import { BlacklistManager, BlacklistError } from '@carllee1983/dbcli/core'
import type { ConnectionPool } from '../connection-pool'
import { SchemaTreeBody, SchemaTableBody } from '../../shared/schemas'
import { toErrorBody } from '../../shared/errors'
import { json } from '../http'

export function makeSchemaHandlers(pool: ConnectionPool) {
  return {
    async tree(req: Request): Promise<Response> {
      const parsed = SchemaTreeBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId required' } }, 400)

      const entry = pool.get(parsed.data.connectionId)
      if (!entry) return json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409)

      try {
        const manager = new BlacklistManager(entry.config)
        const tables = await entry.adapter.listTables()
        const visible = tables
          .filter((t) => !manager.isTableBlacklisted(t.name))
          .map((t) => ({
            name: t.name,
            type: t.tableType ?? 'table',
            columnCount: t.columnCount,
            rowCount: t.rowCount ?? t.estimatedRowCount ?? null,
          }))
        return json({ tables: visible })
      } catch (err) {
        return json(toErrorBody(err), 500)
      }
    },

    async table(req: Request): Promise<Response> {
      const parsed = SchemaTableBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId + table required' } }, 400)

      const entry = pool.get(parsed.data.connectionId)
      if (!entry) return json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409)

      const manager = new BlacklistManager(entry.config)
      // Reject before touching the DB so a protected table's schema never leaks.
      if (manager.isTableBlacklisted(parsed.data.table)) {
        return json(toErrorBody(new BlacklistError(`${parsed.data.table} is protected`, parsed.data.table, 'schema')), 403)
      }

      try {
        const schema = await entry.adapter.getTableSchema(parsed.data.table)
        const blacklisted = new Set(manager.getBlacklistedColumns(parsed.data.table))
        const columns = schema.columns.filter((c) => !blacklisted.has(c.name))
        return json({ table: { ...schema, columns } })
      } catch (err) {
        return json(toErrorBody(err), 500)
      }
    },
  }
}
