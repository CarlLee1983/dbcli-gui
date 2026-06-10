import { BlacklistManager, BlacklistError } from '@carllee1983/dbcli/core'
import type { ConnectionPool, PoolEntry } from '../connection-pool'
import { SchemaTableBody } from '../../shared/schemas'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { tableDialectFor } from '../dialect'
import type { TableDialect } from '../dialect'
import { json } from '../http'

interface RelationRef {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  constraintName?: string
}

type ResolveResult =
  | { error: Response }
  | { entry: PoolEntry; table: string; dialect: TableDialect; manager: BlacklistManager }

/** Shared guard: parse body, resolve an open pool entry, reject blacklisted tables. */
async function resolve(pool: ConnectionPool, req: Request): Promise<ResolveResult> {
  const parsed = SchemaTableBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return { error: json({ error: { code: 'BAD_REQUEST', message: 'connectionId + table required' } }, 400) }
  const entry = pool.get(parsed.data.connectionId)
  if (!entry) return { error: json({ error: { code: 'NOT_OPEN', message: 'connection not open' } }, 409) }
  const manager = new BlacklistManager(entry.config)
  if (manager.isTableBlacklisted(parsed.data.table)) {
    const body = toErrorBody(new BlacklistError(`${parsed.data.table} is protected`, parsed.data.table, 'schema'))
    return { error: json(body, statusForCode(body.error.code)) }
  }
  const system = (entry.config.connection as { system: string }).system
  return { entry, table: parsed.data.table, dialect: tableDialectFor(system), manager }
}

/** Run a CREATE-source query and pull the create text; null when the dialect has none. */
async function readCreateSql(
  adapter: PoolEntry['adapter'],
  q: { sql: string; params: Array<string | number | boolean | null> } | null,
): Promise<string | null> {
  if (!q) return null
  const res = await adapter.execute<Record<string, unknown>>(q.sql, q.params)
  const row = res.rows[0]
  return row ? String(row['Create Table'] ?? row['Create View'] ?? '') || null : null
}

export function makeTableDetailHandlers(pool: ConnectionPool) {
  return {
    async triggers(req: Request): Promise<Response> {
      const r = await resolve(pool, req)
      if ('error' in r) return r.error
      try {
        const q = r.dialect.triggers(r.table)
        const res = await r.entry.adapter.execute<Record<string, unknown>>(q.sql, q.params)
        const triggers = res.rows.map((row) => ({
          name: String(row.name ?? ''),
          timing: String(row.timing ?? ''),
          event: String(row.event ?? ''),
          statement: String(row.statement ?? ''),
        }))
        return json({ triggers })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },

    async info(req: Request): Promise<Response> {
      const r = await resolve(pool, req)
      if ('error' in r) return r.error
      try {
        const q = r.dialect.info(r.table)
        const statusRes = await r.entry.adapter.execute<Record<string, unknown>>(q.sql, q.params)
        const row = statusRes.rows[0] ?? {}
        const createSql = await readCreateSql(r.entry.adapter, r.dialect.createTable(r.table))
        const num = (v: unknown): number | null => (v == null ? null : Number(v))
        return json({
          info: {
            engine: row.engine == null ? null : String(row.engine),
            rowCount: num(row.rowCount),
            sizeBytes: num(row.sizeBytes),
            collation: row.collation == null ? null : String(row.collation),
            createdAt: row.createdAt == null ? null : String(row.createdAt),
            createSql,
          },
        })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },

    async relations(req: Request): Promise<Response> {
      const r = await resolve(pool, req)
      if ('error' in r) return r.error
      try {
        // Forward FKs come from the parsed schema (core already extracts them).
        const schema = await r.entry.adapter.getTableSchema(r.table)
        const blacklistedCols = new Set(r.manager.getBlacklistedColumns(r.table))
        const forward: RelationRef[] = (schema.foreignKeys ?? []).flatMap((fk) =>
          fk.columns
            .map((col, i) => ({
              fromTable: r.table,
              fromColumn: col,
              toTable: fk.refTable,
              toColumn: fk.refColumns[i] ?? fk.refColumns[0] ?? '',
              constraintName: fk.name,
            }))
            .filter((ref) => !blacklistedCols.has(ref.fromColumn)),
        )
        const q = r.dialect.reverseRelations(r.table)
        const res = await r.entry.adapter.execute<Record<string, unknown>>(q.sql, q.params)
        const reverse: RelationRef[] = res.rows.map((row) => ({
          fromTable: String(row.fromTable ?? ''),
          fromColumn: String(row.fromColumn ?? ''),
          toTable: r.table,
          toColumn: String(row.toColumn ?? ''),
          constraintName: row.constraintName == null ? undefined : String(row.constraintName),
        }))
        return json({ relations: { forward, reverse } })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },
  }
}
