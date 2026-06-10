import type {
  ConnectionSummary,
  QueryResultDto,
  TreeTable,
  TableSchemaDto,
  ConnectionFormInput,
  ConnectionDetail,
  TestResult,
  MutateOps,
  MutateResult,
  Permission,
} from './types'
import { saveFile } from './save-file'

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

interface InjectedConnParams {
  port?: number | string
  token?: string
}

/**
 * Read port + token. The Tauri shell injects `window.__DBCLI__` before any page
 * script runs; the dev harness uses the URL query string. Global wins when present.
 */
export function readConnParams(search: string = location.search): { port: string; token: string } {
  const injected = (globalThis as { __DBCLI__?: InjectedConnParams }).__DBCLI__
  if (injected?.port != null && injected?.token != null) {
    return { port: String(injected.port), token: String(injected.token) }
  }
  const params = new URLSearchParams(search)
  return { port: params.get('port') ?? '', token: params.get('token') ?? '' }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string }
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const match = /filename="([^"]+)"|filename=([^;,\s]+)/.exec(header)
  return match?.[1] ?? match?.[2] ?? fallback
}

export interface DbClient {
  health(): Promise<{ ok: boolean; version: string }>
  listConnections(): Promise<{ connections: ConnectionSummary[] }>
  openConnection(id: string): Promise<{ ok: boolean; system: string; permission: Permission }>
  closeConnection(id: string): Promise<{ ok: boolean }>
  query(id: string, sql: string, limit?: number): Promise<QueryResultDto>
  schemaTree(id: string): Promise<{ tables: TreeTable[] }>
  schemaTable(id: string, table: string): Promise<TableSchemaDto>
  exportRows(id: string, sql: string, format: 'csv' | 'json'): Promise<void>
  createConnection(input: ConnectionFormInput): Promise<{ ok: boolean }>
  updateConnection(input: ConnectionFormInput): Promise<{ ok: boolean }>
  deleteConnection(name: string): Promise<{ ok: boolean }>
  setDefaultConnection(name: string): Promise<{ ok: boolean }>
  testConnection(input: Omit<ConnectionFormInput, 'name'>): Promise<TestResult>
  getConnection(name: string): Promise<ConnectionDetail>
  mutate(id: string, table: string, ops: MutateOps): Promise<MutateResult>
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
    openConnection: (id) => post('/connections/open', { connectionId: id }) as Promise<{ ok: boolean; system: string; permission: Permission }>,
    closeConnection: (id) => post('/connections/close', { connectionId: id }) as Promise<{ ok: boolean }>,
    query: (id, sql, limit) =>
      post('/query', { connectionId: id, sql, ...(limit !== undefined ? { limit } : {}) }) as Promise<QueryResultDto>,
    schemaTree: (id) => post('/schema/tree', { connectionId: id }) as Promise<{ tables: TreeTable[] }>,
    schemaTable: async (id, table) => {
      const body = (await post('/schema/table', { connectionId: id, table })) as { table: TableSchemaDto }
      return body.table
    },
    createConnection: (input) => post('/connections/create', input) as Promise<{ ok: boolean }>,
    updateConnection: (input) => post('/connections/update', input) as Promise<{ ok: boolean }>,
    deleteConnection: (name) => post('/connections/delete', { name }) as Promise<{ ok: boolean }>,
    setDefaultConnection: (name) => post('/connections/set-default', { name }) as Promise<{ ok: boolean }>,
    testConnection: (input) => post('/connections/test', input) as Promise<TestResult>,
    getConnection: (name) => get(`/connections/get?name=${encodeURIComponent(name)}`) as Promise<ConnectionDetail>,
    mutate: (id, table, ops) => post('/data/mutate', { connectionId: id, table, ops }) as Promise<MutateResult>,
    exportRows: async (id, sql, format) => {
      const res = await fetch(`${base}/export`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId: id, sql, format }),
      })
      if (!res.ok) {
        await parseOrThrow(res) // always throws ApiError on a non-2xx response
      }
      const blob = await res.blob()
      const filename = filenameFromDisposition(res.headers.get('content-disposition'), `export.${format}`)
      await saveFile(filename, blob)
    },
  }
}

/** Default singleton built from the injected URL params. */
const { port, token } = readConnParams()
export const client: DbClient = makeClient(`http://127.0.0.1:${port}`, token)
