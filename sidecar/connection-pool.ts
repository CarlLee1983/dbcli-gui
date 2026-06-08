import {
  AdapterFactory,
  readConfig,
  type DatabaseAdapter,
  type DbcliConfig,
  type SqlConnectionOptions,
} from '@carllee1983/dbcli/core'

export interface PoolEntry {
  adapter: DatabaseAdapter
  config: DbcliConfig
}

export interface PoolDeps {
  /** Load a fully-resolved DbcliConfig for a connection id. Default: readConfig(dbcliPath, id). */
  loadConfig: (connectionId: string) => Promise<DbcliConfig>
  /** Build (not yet connected) an adapter from a config. Default: SQL adapter via AdapterFactory. */
  openAdapter: (config: DbcliConfig) => DatabaseAdapter
}

/** Build default deps bound to a project `.dbcli` path. */
export function defaultPoolDeps(dbcliPath: string): PoolDeps {
  return {
    loadConfig: (id) => readConfig(dbcliPath, id),
    // $env refs are already expanded by readConfig; narrow to SQL options like the CLI does.
    openAdapter: (config) => AdapterFactory.createSqlAdapter(config.connection as SqlConnectionOptions),
  }
}

/** Holds one connected adapter per connectionId. */
export class ConnectionPool {
  private readonly entries = new Map<string, PoolEntry>()
  constructor(private readonly deps: PoolDeps) {}

  async open(connectionId: string): Promise<PoolEntry> {
    // Single-writer assumption: callers do not race concurrent open() on the same id.
    // (No in-flight guard — fine for a local single-user sidecar.)
    const existing = this.entries.get(connectionId)
    if (existing) return existing
    const config = await this.deps.loadConfig(connectionId)
    const adapter = this.deps.openAdapter(config)
    await adapter.connect()
    const entry: PoolEntry = { adapter, config }
    this.entries.set(connectionId, entry)
    return entry
  }

  get(connectionId: string): PoolEntry | undefined {
    return this.entries.get(connectionId)
  }

  async close(connectionId: string): Promise<void> {
    const entry = this.entries.get(connectionId)
    if (!entry) return
    this.entries.delete(connectionId)
    await entry.adapter.disconnect()
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.close(id)))
  }
}
