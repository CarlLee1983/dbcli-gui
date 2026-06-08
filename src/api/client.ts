import type {
  ConnectionSummary,
  QueryResultDto,
  TreeTable,
  TableSchemaDto,
} from './types'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Read port + token injected via the URL query string (dev harness or Tauri shell). */
export function readConnParams(search: string = location.search): { port: string; token: string } {
  const params = new URLSearchParams(search)
  return { port: params.get('port') ?? '', token: params.get('token') ?? '' }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string }
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const match = /filename="?([^"]+)"?/.exec(header)
  return match?.[1] ?? fallback
}

/** Build a download via a transient <a download> anchor. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface DbClient {
  health(): Promise<{ ok: boolean; version: string }>
  listConnections(): Promise<{ connections: ConnectionSummary[] }>
  openConnection(id: string): Promise<{ ok: boolean; system: string }>
  closeConnection(id: string): Promise<{ ok: boolean }>
  query(id: string, sql: string, limit?: number): Promise<QueryResultDto>
  schemaTree(id: string): Promise<{ tables: TreeTable[] }>
  schemaTable(id: string, table: string): Promise<TableSchemaDto>
  exportRows(id: string, sql: string, format: 'csv' | 'json'): Promise<void>
}

export function makeClient(base: string, token: string): DbClient {
  const auth = { Authorization: `Bearer ${token}` }

  async function parseOrThrow(res: Response): Promise<unknown> {
    if (res.ok) return res.json()
    let code = 'INTERNAL'
    let message = res.statusText || 'request failed'
    try {
      const body = (await res.json()) as ErrorEnvelope
      if (body.error?.code) code = body.error.code
      if (body.error?.message) message = body.error.message
    } catch {
      // non-JSON error body; keep defaults
    }
    throw new ApiError(code, message, res.status)
  }

  function get(path: string): Promise<unknown> {
    return fetch(`${base}${path}`, { headers: { ...auth } }).then(parseOrThrow)
  }

  function post(path: string, body: unknown): Promise<unknown> {
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(parseOrThrow)
  }

  return {
    health: () => get('/health') as Promise<{ ok: boolean; version: string }>,
    listConnections: () => post('/connections/list', {}) as Promise<{ connections: ConnectionSummary[] }>,
    openConnection: (id) => post('/connections/open', { connectionId: id }) as Promise<{ ok: boolean; system: string }>,
    closeConnection: (id) => post('/connections/close', { connectionId: id }) as Promise<{ ok: boolean }>,
    query: (id, sql, limit) =>
      post('/query', { connectionId: id, sql, ...(limit !== undefined ? { limit } : {}) }) as Promise<QueryResultDto>,
    schemaTree: (id) => post('/schema/tree', { connectionId: id }) as Promise<{ tables: TreeTable[] }>,
    schemaTable: async (id, table) => {
      const body = (await post('/schema/table', { connectionId: id, table })) as { table: TableSchemaDto }
      return body.table
    },
    exportRows: async (id, sql, format) => {
      const res = await fetch(`${base}/export`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId: id, sql, format }),
      })
      if (!res.ok) {
        await parseOrThrow(res)
        return
      }
      const blob = await res.blob()
      const filename = filenameFromDisposition(res.headers.get('content-disposition'), `export.${format}`)
      triggerDownload(blob, filename)
    },
  }
}

/** Default singleton built from the injected URL params. */
const { port, token } = readConnParams()
export const client: DbClient = makeClient(`http://127.0.0.1:${port}`, token)
