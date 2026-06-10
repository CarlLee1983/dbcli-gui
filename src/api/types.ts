export interface ConnectionSummary {
  name: string
  system: string
  isDefault: boolean
}

export interface QueryResultDto {
  rows: Array<Record<string, unknown>>
  fields: string[]
  rowCount: number
  ms: number | null
}

export interface TreeTable {
  name: string
  type: 'table' | 'view'
  columnCount?: number
  rowCount?: number | null
}

export interface TableColumnDto {
  name: string
  type: string
  nullable: boolean
  primaryKey?: boolean
  default?: string
}

export interface TableSchemaDto {
  name: string
  columns: TableColumnDto[]
  primaryKey?: string[]
  indexes?: Array<{ name: string; columns: string[]; unique: boolean }>
}

export type SqlSystem = 'mysql' | 'postgresql' | 'mariadb'

export interface ConnectionFormInput {
  name: string
  system: SqlSystem
  host: string
  port: number
  user: string
  database: string
  password?: string
}

export interface ConnectionDetail {
  name: string
  system: SqlSystem
  host: string
  port: number
  user: string
  database: string
}

export interface TestResult { ok: boolean; ms: number }

export type Permission = 'query-only' | 'read-write' | 'data-admin' | 'admin'

export interface MutateOps {
  updates: Array<{ pk: Record<string, unknown>; set: Record<string, unknown> }>
  inserts: Array<{ values: Record<string, unknown> }>
  deletes: Array<{ pk: Record<string, unknown> }>
}

export interface MutateResult {
  ok: boolean
  applied: { updated: number; inserted: number; deleted: number }
}
