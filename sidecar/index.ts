import { resolveSidecarConfig } from './config'
import { ConnectionPool, defaultPoolDeps } from './connection-pool'
import { createServer } from './server'

if (import.meta.main) {
  const cfg = resolveSidecarConfig()
  const pool = new ConnectionPool(defaultPoolDeps(cfg.dbcliPath))
  const server = createServer({ pool, token: cfg.token, port: cfg.port })

  // The Tauri shell (or a dev caller) reads this line to learn where to connect.
  console.log(JSON.stringify({ ready: true, port: server.port, token: cfg.token }))

  const shutdown = async () => {
    try {
      await pool.closeAll()
      await server.stop(true)
    } finally {
      process.exit(0)
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
