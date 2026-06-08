import { BlacklistError, ConnectionError } from '@carllee1983/dbcli/core'

export interface ErrorBody {
  error: { code: string; message: string }
}

/** Error codes that map to a 4xx client error (HTTP 403) rather than a 500. */
export const CLIENT_ERROR_CODES = new Set(['PERMISSION', 'BLACKLISTED'])

/**
 * Map an error to a user-safe { code, message }. dbcli's typed errors get
 * semantic codes; everything else collapses to INTERNAL (details stay in logs).
 */
export function toErrorBody(err: unknown): ErrorBody {
  if (err instanceof BlacklistError) return { error: { code: 'BLACKLISTED', message: err.message } }
  if (err instanceof ConnectionError) return { error: { code: 'CONNECTION', message: err.message } }
  // PermissionError is not exported as a class; match by name (thrown by QueryExecutor).
  if (err instanceof Error && err.name === 'PermissionError') {
    return { error: { code: 'PERMISSION', message: err.message } }
  }
  if (err instanceof Error) return { error: { code: 'INTERNAL', message: err.message } }
  return { error: { code: 'INTERNAL', message: 'Unknown error' } }
}
