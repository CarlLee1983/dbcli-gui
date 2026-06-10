import { resolveSidecarConfig } from './config'
import { WorkspaceRegistry, GLOBAL_ID } from './workspaces'
import { buildStoreRuntime } from './active-store'
import { createServer } from './server'

if (import.meta.main) {
  const cfg = resolveSidecarConfig()
  const registry = await WorkspaceRegistry.load(cfg.globalDir)

  // 還原上次的 workspace;路徑解析失敗(如專案已刪)→ 退回全域。
  let activeId = registry.activeId()
  let dbcliPath: string
  try {
    dbcliPath = registry.resolvePath(activeId)
  } catch {
    activeId = GLOBAL_ID
    dbcliPath = cfg.globalDir
    await registry.setLastActive(GLOBAL_ID)
  }

  const rt = buildStoreRuntime(dbcliPath)
  const server = createServer({
    pool: rt.pool,
    token: cfg.token,
    port: cfg.port,
    dbcliPath,
    globalDir: cfg.globalDir,
    registry,
    listConnections: rt.lister,
  })

  // The Tauri shell (or a dev caller) reads this line to learn where to connect.
  console.log(JSON.stringify({ ready: true, port: server.port, token: cfg.token }))

  const shutdown = async () => {
    try {
      await rt.pool.closeAll()
      await server.stop(true)
    } finally {
      process.exit(0)
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
