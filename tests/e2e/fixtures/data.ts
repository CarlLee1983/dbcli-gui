import type { DbcliConfig } from '@carllee1983/dbcli/core'
import type { ConnectionSummary } from '../../../sidecar/routes/connections'

/** A column the fake adapter serves (subset of dbcli ColumnSchema). */
export interface SeedColumn {
  name: string
  type: string
  nullable: boolean
  primaryKey?: boolean
  comment?: string
  autoIncrement?: boolean
  foreignKey?: { table: string; column: string }
  enumValues?: string[]
}

export interface SeedTable {
  name: string
  type: 'table' | 'view'
  columns: SeedColumn[]
  rows: Array<Record<string, unknown>>
}

export interface SeedConnection {
  summary: ConnectionSummary
  config: DbcliConfig
  tables: SeedTable[]
}

/** Substring that makes the fake adapter throw — drives the error journey. */
export const FORCE_ERROR = 'FORCE_ERROR'

export const SEED: SeedConnection[] = [
  {
    summary: { name: 'main', system: 'postgresql', isDefault: true },
    config: {
      connection: { system: 'postgresql' },
      permission: 'read-write',
      // secret_table = table-level block; users.password = column-level block.
      blacklist: { tables: ['secret_table'], columns: { users: ['password'] } },
    } as unknown as DbcliConfig,
    tables: [
      {
        name: 'orders',
        type: 'table',
        columns: [
          { name: 'id', type: 'integer', nullable: false, primaryKey: true, comment: '訂單主鍵', autoIncrement: true },
          { name: 'label', type: 'text', nullable: false },
        ],
        rows: [
          { id: 1, label: 'orders-row-1' },
          { id: 2, label: 'orders-row-2' },
          { id: 3, label: 'orders-row-3' },
        ],
      },
      {
        name: 'users',
        type: 'table',
        columns: [
          { name: 'id', type: 'integer', nullable: false, primaryKey: true },
          { name: 'email', type: 'text', nullable: false },
          { name: 'password', type: 'text', nullable: false },
        ],
        rows: [
          { id: 1, email: 'a@example.com', password: 'pw1' },
          { id: 2, email: 'b@example.com', password: 'pw2' },
        ],
      },
      {
        name: 'secret_table',
        type: 'table',
        columns: [{ name: 'id', type: 'integer', nullable: false, primaryKey: true }],
        rows: [{ id: 1 }],
      },
    ],
  },
  {
    summary: { name: 'replica', system: 'mysql', isDefault: false },
    config: { connection: { system: 'mysql' }, permission: 'read-write' } as unknown as DbcliConfig,
    tables: [
      {
        name: 'metrics',
        type: 'view',
        columns: [
          { name: 'k', type: 'text', nullable: false },
          { name: 'v', type: 'integer', nullable: true },
        ],
        rows: [{ k: 'cpu', v: 42 }],
      },
    ],
  },
]
