import type { ConnectionPool } from '../connection-pool'
import { OpenBody, CloseBody } from '../../shared/schemas'
import { toErrorBody } from '../../shared/errors'
import { json } from '../http'

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
