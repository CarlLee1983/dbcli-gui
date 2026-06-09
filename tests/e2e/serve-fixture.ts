import type { DbcliConfig } from '@carllee1983/dbcli/core'
import index from '../../src/index.html'
import { ConnectionPool } from '../../sidecar/connection-pool'
import { createServer } from '../../sidecar/server'
import { SEED } from './fixtures/data'
import { fixtureAdapter } from './fixtures/adapter'
import { SPA_PORT, SIDECAR_PORT, TOKEN } from './fixtures/config'

// loadConfig resolves by connectionId; openAdapter maps a config back to its tables.
const byName = new Map(SEED.map((s) => [s.summary.name, s]))
const tablesByConfig = new Map<DbcliConfig, typeof SEED[number]['tables']>(
  SEED.map((s) => [s.config, s.tables]),
)

const pool = new ConnectionPool({
  loadConfig: async (id: string) => {
    const seed = byName.get(id)
    if (!seed) throw new Error(`unknown fixture connection: ${id}`)
    return seed.config
  },
  openAdapter: (config: DbcliConfig) => fixtureAdapter(tablesByConfig.get(config) ?? []),
})

createServer({
  pool,
  token: TOKEN,
  port: SIDECAR_PORT,
  listConnections: async () => SEED.map((s) => s.summary),
})

Bun.serve({ port: SPA_PORT, routes: { '/': index } })

console.log(`e2e fixture up — SPA :${SPA_PORT}  sidecar :${SIDECAR_PORT}`)
