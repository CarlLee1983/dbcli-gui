import { join } from 'node:path'
import type { ConnectionPool } from '../connection-pool'
import { OpenBody, CloseBody } from '../../shared/schemas'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { json } from '../http'
import {
  readV2Config,
  listConnections,
  readConfig,
  detectConfigVersion,
  resolveConfigStoragePath,
} from '@carllee1983/dbcli/core'

export function makeConnectionHandlers(pool: ConnectionPool) {
  return {
    async open(req: Request): Promise<Response> {
      const parsed = OpenBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId required' } }, 400)
      try {
        const entry = await pool.open(parsed.data.connectionId)
        return json({
          ok: true,
          system: (entry.config.connection as { system: string }).system,
          permission: (entry.config as { permission?: string }).permission ?? 'query-only',
        })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },
    async close(req: Request): Promise<Response> {
      const parsed = CloseBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId required' } }, 400)
      try {
        await pool.close(parsed.data.connectionId)
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
      return json({ ok: true })
    },
  }
}

export interface ConnectionSummary {
  name: string
  system: string
  isDefault: boolean
}

/** Lists project connections without exposing host/port/credentials. */
export type ConnectionLister = () => Promise<ConnectionSummary[]>

/** dbcli imports a legacy v1 config's single connection under this name on migration,
 *  and its version-agnostic `readConfig` ignores the connection name for v1 — so the
 *  GUI can safely report and open a v1 connection as `default`. */
const V1_DEFAULT_NAME = 'default'

/** Seams for {@link defaultConnectionLister}, so the version-branching logic is unit
 *  testable without real `.dbcli` fixtures (mirrors {@link defaultPoolDeps}). */
export interface ListerDeps {
  /** Parsed `config.json`, or `undefined` when the project has no config yet. */
  readRawConfig: (dbcliPath: string) => Promise<unknown | undefined>
  detectVersion: (raw: unknown) => 1 | 2
  /** Project the v2 config's named connections to summaries. */
  listV2: (dbcliPath: string) => Promise<ConnectionSummary[]>
  /** Resolve a v1 config; only `connection.system` is read. */
  readV1: (dbcliPath: string) => Promise<{ connection: { system: string } }>
}

export function defaultListerDeps(): ListerDeps {
  return {
    readRawConfig: async (dbcliPath) => {
      const storagePath = await resolveConfigStoragePath(dbcliPath)
      const file = Bun.file(join(storagePath, 'config.json'))
      return (await file.exists()) ? (JSON.parse(await file.text()) as unknown) : undefined
    },
    detectVersion: detectConfigVersion,
    listV2: async (dbcliPath) =>
      listConnections(await readV2Config(dbcliPath)).map((c) => ({
        name: c.name,
        system: c.system,
        isDefault: c.isDefault,
      })),
    readV1: (dbcliPath) => readConfig(dbcliPath) as Promise<{ connection: { system: string } }>,
  }
}

/**
 * Default lister, version-aware. v2 configs project their named connections; a legacy
 * v1 (single-connection) config projects one `default` entry — instead of letting the
 * v2-only Zod schema reject it as an opaque INTERNAL error. Reports name/system/default
 * only, never host/port/credentials.
 */
export function defaultConnectionLister(
  dbcliPath: string,
  deps: ListerDeps = defaultListerDeps(),
): ConnectionLister {
  return async () => {
    const raw = await deps.readRawConfig(dbcliPath)
    if (raw === undefined) {
      // Mirror dbcli's own "missing config" signal so it maps to NOT_CONFIGURED.
      const err = new Error(`找不到設定檔:${join(dbcliPath, 'config.json')}`)
      err.name = 'ConfigError'
      throw err
    }
    if (deps.detectVersion(raw) === 2) return deps.listV2(dbcliPath)
    const v1 = await deps.readV1(dbcliPath)
    return [{ name: V1_DEFAULT_NAME, system: v1.connection.system, isDefault: true }]
  }
}

/** Handler for POST /connections/list. Returns 501 when no lister is wired. */
export function makeListHandler(lister?: ConnectionLister) {
  return async function list(_req: Request): Promise<Response> {
    if (!lister) {
      const body = { error: { code: 'NOT_CONFIGURED', message: 'connection listing not configured' } }
      return json(body, statusForCode(body.error.code))
    }
    try {
      return json({ connections: await lister() })
    } catch (err) {
      const body = toErrorBody(err)
      return json(body, statusForCode(body.error.code))
    }
  }
}
