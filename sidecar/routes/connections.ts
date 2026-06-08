import type { ConnectionPool } from '../connection-pool'
import { OpenBody, CloseBody } from '../../shared/schemas'
import { toErrorBody } from '../../shared/errors'
import { json } from '../http'
import { readV2Config, listConnections } from '@carllee1983/dbcli/core'

export function makeConnectionHandlers(pool: ConnectionPool) {
  return {
    async open(req: Request): Promise<Response> {
      const parsed = OpenBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId required' } }, 400)
      try {
        const entry = await pool.open(parsed.data.connectionId)
        return json({ ok: true, system: (entry.config.connection as { system: string }).system })
      } catch (err) {
        return json(toErrorBody(err), 502)
      }
    },
    async close(req: Request): Promise<Response> {
      const parsed = CloseBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'connectionId required' } }, 400)
      try {
        await pool.close(parsed.data.connectionId)
      } catch (err) {
        return json(toErrorBody(err), 502)
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

/** Default lister: read the v2 `.dbcli` config and project name/system/default. */
export function defaultConnectionLister(dbcliPath: string): ConnectionLister {
  return async () => {
    const config = await readV2Config(dbcliPath)
    return listConnections(config).map((c) => ({
      name: c.name,
      system: c.system,
      isDefault: c.isDefault,
    }))
  }
}

/** Handler for POST /connections/list. Returns 501 when no lister is wired. */
export function makeListHandler(lister?: ConnectionLister) {
  return async function list(_req: Request): Promise<Response> {
    if (!lister) {
      return json({ error: { code: 'NOT_CONFIGURED', message: 'connection listing not configured' } }, 501)
    }
    try {
      return json({ connections: await lister() })
    } catch (err) {
      return json(toErrorBody(err), 500)
    }
  }
}
