import { z } from 'zod'

export const OpenBody = z.object({ connectionId: z.string().min(1) })
export const CloseBody = z.object({ connectionId: z.string().min(1) })
export const QueryBody = z.object({
  connectionId: z.string().min(1),
  sql: z.string().min(1),
  limit: z.number().int().positive().optional(),
})

export type OpenBody = z.infer<typeof OpenBody>
export type CloseBody = z.infer<typeof CloseBody>
export type QueryBody = z.infer<typeof QueryBody>
