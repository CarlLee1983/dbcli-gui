import { z } from 'zod'

export const OpenBody = z.object({ connectionId: z.string().min(1) })
export const CloseBody = z.object({ connectionId: z.string().min(1) })
export const QueryBody = z.object({
  connectionId: z.string().min(1),
  sql: z.string().min(1),
  limit: z.number().int().positive().optional(),
})

export const SchemaTreeBody = z.object({ connectionId: z.string().min(1) })
export const SchemaTableBody = z.object({
  connectionId: z.string().min(1),
  table: z.string().min(1),
})
export const ExportBody = z.object({
  connectionId: z.string().min(1),
  sql: z.string().min(1),
  format: z.enum(['csv', 'json']),
  limit: z.number().int().positive().optional(),
})

export type OpenBody = z.infer<typeof OpenBody>
export type CloseBody = z.infer<typeof CloseBody>
export type QueryBody = z.infer<typeof QueryBody>
export type SchemaTreeBody = z.infer<typeof SchemaTreeBody>
export type SchemaTableBody = z.infer<typeof SchemaTableBody>
export type ExportBody = z.infer<typeof ExportBody>

const SqlSystemEnum = z.enum(['mysql', 'postgresql', 'mariadb'])

export const ConnectionInputBody = z.object({
  name: z.string().min(1),
  system: SqlSystemEnum,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1),
  database: z.string().min(1),
  password: z.string().optional(),
})
export const ConnectionNameBody = z.object({ name: z.string().min(1) })
export const TestConnectionBody = z.object({
  system: SqlSystemEnum,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1),
  database: z.string().min(1),
  password: z.string().optional(),
})

export type ConnectionInputBody = z.infer<typeof ConnectionInputBody>
export type ConnectionNameBody = z.infer<typeof ConnectionNameBody>
export type TestConnectionBody = z.infer<typeof TestConnectionBody>

const RowValues = z.record(z.string(), z.unknown())

export const MutateBody = z.object({
  connectionId: z.string().min(1),
  table: z.string().min(1),
  ops: z.object({
    updates: z.array(z.object({ pk: RowValues, set: RowValues })).default([]),
    inserts: z.array(z.object({ values: RowValues })).default([]),
    deletes: z.array(z.object({ pk: RowValues })).default([]),
  }),
})

export type MutateBody = z.infer<typeof MutateBody>
