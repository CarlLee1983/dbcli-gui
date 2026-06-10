import type { WorkspaceRegistry } from '../workspaces'
import type { ActiveStore } from '../active-store'
import type { ConnectionSummary } from './connections'
import { WorkspaceAddBody, WorkspaceIdBody } from '../../shared/schemas'
import { GLOBAL_ID } from '../workspaces'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { json } from '../http'

/** 由 server.ts 注入:closeAll 舊連線 + 重建 pool/lister + reload 路由,回新連線清單。 */
export type SelectWorkspace = (id: string) => Promise<ConnectionSummary[]>

export function makeWorkspaceHandlers(
  registry: WorkspaceRegistry,
  store: ActiveStore,
  selectWorkspace: SelectWorkspace,
) {
  return {
    async list(_req: Request): Promise<Response> {
      return json({ workspaces: registry.list(), activeId: store.id })
    },

    async add(req: Request): Promise<Response> {
      const parsed = WorkspaceAddBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'path required' } }, 400)
      try {
        const added = await registry.add(parsed.data.path, parsed.data.label)
        return json({ workspaces: registry.list(), added })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },

    async remove(req: Request): Promise<Response> {
      const parsed = WorkspaceIdBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'id required' } }, 400)
      if (parsed.data.id === GLOBAL_ID) {
        return json({ error: { code: 'BAD_REQUEST', message: 'cannot remove global workspace' } }, 400)
      }
      try {
        const wasActive = store.id === parsed.data.id
        await registry.remove(parsed.data.id)
        // 若移除的是目前作用中 workspace,自動切回全域並取得新連線清單,一併回傳給前端重置。
        const connections = wasActive ? await selectWorkspace(GLOBAL_ID) : null
        return json({
          workspaces: registry.list(),
          activeId: store.id,
          ...(connections ? { connections } : {}),
        })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },

    async select(req: Request): Promise<Response> {
      const parsed = WorkspaceIdBody.safeParse(await req.json().catch(() => null))
      if (!parsed.success) return json({ error: { code: 'BAD_REQUEST', message: 'id required' } }, 400)
      try {
        const connections = await selectWorkspace(parsed.data.id)
        return json({ connections, activeId: store.id })
      } catch (err) {
        const body = toErrorBody(err)
        return json(body, statusForCode(body.error.code))
      }
    },
  }
}
