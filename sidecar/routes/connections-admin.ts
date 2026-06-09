import {
  readV2Config, writeV2Config, detectConfigVersion, migrateV1ToV2, readConfig,
  upsertConnection, removeConnection, setDefaultConnection, writeConnectionSecret,
  resolveConfigStoragePath, type ConnectionInput,
} from '@carllee1983/dbcli/core'
import { join } from 'node:path'
import { ConnectionInputBody, ConnectionNameBody } from '../../shared/schemas'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { json } from '../http'

/** Read the current v2 config, migrating a v1 project on first write. */
async function loadV2(dbcliPath: string) {
  const storagePath = await resolveConfigStoragePath(dbcliPath)
  const raw = await Bun.file(join(storagePath, 'config.json')).json().catch(() => undefined)
  if (raw !== undefined && detectConfigVersion(raw) === 2) return readV2Config(dbcliPath)
  const v1 = await readConfig(dbcliPath)
  return migrateV1ToV2(v1)
}

export function makeConnectionAdminHandlers(dbcliPath: string) {
  const ok = (body: unknown = { ok: true }) => json(body)
  const fail = (err: unknown) => {
    const body = toErrorBody(err)
    return json(body, statusForCode(body.error.code))
  }
  const bad = () => json({ error: { code: 'BAD_REQUEST', message: 'invalid body' } }, 400)
  const conflict = (m: string) => json({ error: { code: 'CONFLICT', message: m } }, 409)
  const notFound = (m: string) => json({ error: { code: 'NOT_FOUND', message: m } }, 404)

  async function writeWithSecret(name: string, input: ConnectionInput, password: string | undefined) {
    const cfg = await loadV2(dbcliPath)
    const next = upsertConnection(cfg, input)
    await writeV2Config(dbcliPath, next)
    if (password !== undefined && password !== '') {
      await writeConnectionSecret(dbcliPath, name, 'password', password)
    }
  }

  return {
    async create(req: Request): Promise<Response> {
      const p = ConnectionInputBody.safeParse(await req.json().catch(() => null))
      if (!p.success) return bad()
      try {
        const cfg = await loadV2(dbcliPath)
        if (p.data.name in cfg.connections) return conflict(`連線 '${p.data.name}' 已存在`)
        const { password, ...input } = p.data
        await writeWithSecret(p.data.name, input, password)
        return ok()
      } catch (err) { return fail(err) }
    },

    async update(req: Request): Promise<Response> {
      const p = ConnectionInputBody.safeParse(await req.json().catch(() => null))
      if (!p.success) return bad()
      try {
        const cfg = await loadV2(dbcliPath)
        if (!(p.data.name in cfg.connections)) return notFound(`連線 '${p.data.name}' 不存在`)
        const { password, ...input } = p.data
        await writeWithSecret(p.data.name, input, password)
        return ok()
      } catch (err) { return fail(err) }
    },

    async remove(req: Request): Promise<Response> {
      const p = ConnectionNameBody.safeParse(await req.json().catch(() => null))
      if (!p.success) return bad()
      try {
        const cfg = await loadV2(dbcliPath)
        if (!(p.data.name in cfg.connections)) return notFound(`連線 '${p.data.name}' 不存在`)
        try {
          await writeV2Config(dbcliPath, removeConnection(cfg, p.data.name))
        } catch (e) {
          if (e instanceof Error && e.message.includes('最後一條')) return conflict(e.message)
          throw e
        }
        return ok()
      } catch (err) { return fail(err) }
    },

    async setDefault(req: Request): Promise<Response> {
      const p = ConnectionNameBody.safeParse(await req.json().catch(() => null))
      if (!p.success) return bad()
      try {
        const cfg = await loadV2(dbcliPath)
        if (!(p.data.name in cfg.connections)) return notFound(`連線 '${p.data.name}' 不存在`)
        await writeV2Config(dbcliPath, setDefaultConnection(cfg, p.data.name))
        return ok()
      } catch (err) { return fail(err) }
    },

    async get(req: Request): Promise<Response> {
      const name = new URL(req.url).searchParams.get('name') ?? ''
      try {
        const cfg = await loadV2(dbcliPath)
        const c = cfg.connections[name] as Record<string, unknown> | undefined
        if (!c) return notFound(`連線 '${name}' 不存在`)
        return json({ name, system: c.system, host: c.host, port: c.port, user: c.user, database: c.database })
      } catch (err) { return fail(err) }
    },

    test: undefined as never, // Task 3
  }
}
