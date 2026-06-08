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
