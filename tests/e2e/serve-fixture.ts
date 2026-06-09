import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { DbcliConfig } from '@carllee1983/dbcli/core'
import {
  writeV2Config,
  writeProjectBinding,
  getProjectStoragePath,
  readV2Config,
  listConnections as coreList,
} from '@carllee1983/dbcli/core'
import index from '../../src/index.html'
import { ConnectionPool } from '../../sidecar/connection-pool'
import { createServer } from '../../sidecar/server'
import { SEED } from './fixtures/data'
import { fixtureAdapter } from './fixtures/adapter'
import { SPA_PORT, SIDECAR_PORT, TOKEN } from './fixtures/config'

// ── temp .dbcli project for the connection-management E2E journey ──────────────
const E2E_PROJECT = join(tmpdir(), 'dbcli-gui-e2e', '.dbcli')
await Bun.$`rm -rf ${join(tmpdir(), 'dbcli-gui-e2e')}`
await Bun.$`mkdir -p ${E2E_PROJECT}`
await writeProjectBinding(E2E_PROJECT, getProjectStoragePath(E2E_PROJECT))
await writeV2Config(E2E_PROJECT, {
  version: 2,
  default: 'main',
  connections: {
    main: {
      system: 'mysql',
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: { $env: 'DBCLI_MAIN_PASSWORD' },
      database: 'shop',
      permission: 'query-only',
      envFile: '.env.main',
    },
  },
  schema: {},
  schemas: {},
  metadata: { version: '2.0' },
  blacklist: { tables: [], columns: {} },
  audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
} as never)

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
  dbcliPath: E2E_PROJECT,
  listConnections: async () =>
    coreList(await readV2Config(E2E_PROJECT)).map((c) => ({
      name: c.name,
      system: c.system,
      isDefault: c.isDefault,
    })),
})

Bun.serve({ port: SPA_PORT, routes: { '/': index } })

console.log(`e2e fixture up — SPA :${SPA_PORT}  sidecar :${SIDECAR_PORT}`)
