import { BlacklistError, ConnectionError } from '@carllee1983/dbcli/core'

export interface ErrorBody {
  error: { code: string; message: string }
}

/** HTTP status for each user-safe error code. Unknown codes fall back to 500. */
const STATUS_BY_CODE: Record<string, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  PERMISSION: 403,
  BLACKLISTED: 403,
  NOT_OPEN: 409,
  CONFLICT: 409,
  NOT_CONFIGURED: 501,
  CONNECTION: 502,
  INTERNAL: 500,
}

/** Map a user-safe error code to its HTTP status. Single source of truth for all routes. */
export function statusForCode(code: string): number {
  return STATUS_BY_CODE[code] ?? 500
}

/**
 * Map an error to a user-safe { code, message }. dbcli's typed errors get
 * semantic codes; everything else collapses to INTERNAL (details stay in logs).
 */
export function toErrorBody(err: unknown): ErrorBody {
  if (err instanceof BlacklistError) return { error: { code: 'BLACKLISTED', message: err.message } }
  if (err instanceof ConnectionError) return { error: { code: 'CONNECTION', message: err.message } }
  // PermissionError (QueryExecutor) and ConfigError (config/connection lookup) are not
  // exported as classes, so match them by name.
  if (err instanceof Error && err.name === 'PermissionError') {
    return { error: { code: 'PERMISSION', message: err.message } }
  }
  if (err instanceof Error && err.name === 'ConfigError') {
    return { error: { code: 'NOT_CONFIGURED', message: err.message } }
  }
  if (err instanceof Error) return { error: { code: 'INTERNAL', message: err.message } }
  return { error: { code: 'INTERNAL', message: 'Unknown error' } }
}
