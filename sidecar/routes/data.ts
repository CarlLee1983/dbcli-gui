import { BlacklistManager, BlacklistValidator, DataExecutor, BlacklistError } from '@carllee1983/dbcli/core'
import type { Permission } from '@carllee1983/dbcli/core'
import type { ConnectionPool } from '../connection-pool'
import { MutateBody } from '../../shared/schemas'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { json } from '../http'

/** Optimistic-concurrency violation: an update/delete matched != 1 row. */
class ConflictError extends Error {}

// mariadb shares MySQL's dialect (backtick identifiers, `?` placeholders).
function dialectFor(system: string): 'postgresql' | 'mysql' {
  if (system === 'postgresql') return 'postgresql'
  if (system === 'mysql' || system === 'mariadb') return 'mysql'
  throw new Error(`Unsupported system for data mutations: ${system}`)
}

export function makeDataHandlers(pool: ConnectionPool) {
  return {
    async mutate(req: Request): Promise<Response> {
      const parsed = MutateBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId + table + ops required' } }, 400)

      const { connectionId, table, ops } = parsed.data
      const entry = pool.get(connectionId)
      if (!entry) return json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409)

      const permission = ((entry.config as { permission?: Permission }).permission ?? 'query-only')
      const wantsWrite = ops.updates.length > 0 || ops.inserts.length > 0
      const wantsDelete = ops.deletes.length > 0

      if (!wantsWrite && !wantsDelete) return json({ error: { code: 'BAD_REQUEST', message: 'no operations provided' } }, 400)
      if (wantsWrite && permission === 'query-only')
        return json({ error: { code: 'PERMISSION', message: 'read-write permission required to modify data' } }, 403)
      if (wantsDelete && permission !== 'data-admin' && permission !== 'admin')
        return json({ error: { code: 'PERMISSION', message: 'data-admin permission required to delete rows' } }, 403)

      const manager = new BlacklistManager(entry.config)
      if (manager.isTableBlacklisted(table)) {
        const body = toErrorBody(new BlacklistError(`${table} is protected`, table, 'data'))
        return json(body, statusForCode(body.error.code))
      }
      const blacklistedCols = new Set(manager.getBlacklistedColumns(table))
      const touched = [
        ...ops.updates.flatMap((u) => Object.keys(u.set)),
        ...ops.inserts.flatMap((i) => Object.keys(i.values)),
      ]
      const hit = touched.find((c) => blacklistedCols.has(c))
      if (hit) {
        const body = toErrorBody(new BlacklistError(`${table}.${hit} is protected`, table, 'data'))
        return json(body, statusForCode(body.error.code))
      }

      const dialect = dialectFor((entry.config.connection as { system: string }).system)
      const validator = new BlacklistValidator(manager)
      const executor = new DataExecutor(entry.adapter, permission, dialect, validator)

      try {
        const schema = await entry.adapter.getTableSchema(table)
        if (!schema) return json({ error: { code: 'NOT_FOUND', message: `table ${table} not found` } }, 404)

        await entry.adapter.execute('BEGIN')
        let updated = 0, inserted = 0, deleted = 0
        try {
          for (const d of ops.deletes) {
            const r = await executor.executeDelete(table, d.pk, schema, { force: true })
            if (r.status === 'error') throw new Error(r.error ?? 'delete failed')
            if (r.rows_affected !== 1) throw new ConflictError()
            deleted += r.rows_affected
          }
          for (const u of ops.updates) {
            const r = await executor.executeUpdate(table, u.set, u.pk, schema, { force: true })
            if (r.status === 'error') throw new Error(r.error ?? 'update failed')
            if (r.rows_affected !== 1) throw new ConflictError()
            updated += r.rows_affected
          }
          for (const i of ops.inserts) {
            const r = await executor.executeInsert(table, i.values, schema, { force: true })
            if (r.status === 'error') throw new Error(r.error ?? 'insert failed')
            inserted += r.rows_affected
          }
          await entry.adapter.execute('COMMIT')
        } catch (txErr) {
          await entry.adapter.execute('ROLLBACK').catch(() => {})
          throw txErr
        }
        return json({ ok: true, applied: { updated, inserted, deleted } })
      } catch (err) {
        if (err instanceof ConflictError)
          return json({ error: { code: 'CONFLICT', message: 'row was modified or removed by another process' } }, 409)
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },
  }
}
