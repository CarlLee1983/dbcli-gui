import type { QueryResultDto, TableSchemaDto, SubTab, TriggerDto, TableInfoDto, RelationsDto } from '../api/types'
import type { SortDir } from '../views/grid-virtual'
import type { ApiError } from '../api/client'

/** Lazy sub-tabs fetched on demand; undefined cache = not yet loaded. */
export type LazyKey = 'triggers' | 'info' | 'relations'

export interface SubTabError { code: string; message: string; status: number }

export interface TableSession {
  connectionId: string
  table: string
  /** Structure + forward-FK source; fetched when the table tab opens. */
  schema: TableSchemaDto
  subTab: SubTab
  // Lazy caches (undefined = not loaded yet)
  triggers?: TriggerDto[]
  info?: TableInfoDto
  relations?: RelationsDto
  // Per-sub-tab fetch errors (inline display; one failure never clobbers another)
  cacheErrors?: Partial<Record<LazyKey, SubTabError>>
  // Content sub-tab state — reused by TableBrowser
  rows?: Array<Record<string, unknown>>
  // The query that (re)fetches the content rows; replayed after a save.
  sql?: string
  // Result column names for an arbitrary-SQL edit; undefined = full schema browse.
  fields?: string[]
  // Content sub-tab sort — server-side ORDER BY re-fetch; null/undefined = default order.
  sortField?: string | null
  sortDir?: SortDir
}

export interface QuerySession {
  id: string
  title: string
  sql: string
  executedSql: string
  result: QueryResultDto | null
  sortField: string | null
  sortDir: SortDir | null
  resultFilter: string
  loading: boolean
  error: ApiError | null
  /** Non-null = this tab is a "table tab" (renders TableTab); null = query editor. */
  table: TableSession | null
}

export interface TabsState {
  sessions: QuerySession[]
  activeId: string
  seq: number
}

export function emptySession(seq: number): QuerySession {
  return {
    id: `tab-${seq}`,
    title: `查詢 ${seq}`,
    sql: '',
    executedSql: '',
    result: null,
    sortField: null,
    sortDir: null,
    resultFilter: '',
    loading: false,
    error: null,
    table: null,
  }
}

export function initTabs(): TabsState {
  const first = emptySession(1)
  return { sessions: [first], activeId: first.id, seq: 1 }
}

export type TabsAction =
  | { type: 'open'; sql?: string }
  | { type: 'close'; id: string }
  | { type: 'rename'; id: string; title: string }
  | { type: 'setActive'; id: string }
  | { type: 'patch'; id: string; patch: Partial<QuerySession> }
  | { type: 'openTableTab'; session: TableSession }
  | { type: 'setTableRows'; id: string; rows: Array<Record<string, unknown>> }
  | { type: 'setContentSort'; id: string; sortField: string | null; sortDir: SortDir; sql: string; rows: Array<Record<string, unknown>> }
  | { type: 'setSubTab'; id: string; subTab: SubTab }
  | { type: 'setTableCache'; id: string; key: LazyKey; value: TriggerDto[] | TableInfoDto | RelationsDto }
  | { type: 'setSubTabError'; id: string; key: LazyKey; error: SubTabError }
  | { type: 'reset' }

/** Apply a function to one session's `table` payload (no-op if it isn't a table tab). */
function mapTable(
  state: TabsState,
  id: string,
  fn: (t: TableSession) => TableSession,
): TabsState {
  return {
    ...state,
    sessions: state.sessions.map((s) => (s.id === id && s.table != null ? { ...s, table: fn(s.table) } : s)),
  }
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      const seq = state.seq + 1
      const s = { ...emptySession(seq), sql: action.sql ?? '' }
      return { sessions: [...state.sessions, s], activeId: s.id, seq }
    }
    case 'close': {
      const idx = state.sessions.findIndex((s) => s.id === action.id)
      if (idx === -1) return state
      const remaining = state.sessions.filter((s) => s.id !== action.id)
      if (remaining.length === 0) {
        const seq = state.seq + 1
        const s = emptySession(seq)
        return { sessions: [s], activeId: s.id, seq }
      }
      let activeId = state.activeId
      if (action.id === state.activeId) {
        const nextIdx = Math.min(idx, remaining.length - 1)
        activeId = remaining[nextIdx]!.id
      }
      return { ...state, sessions: remaining, activeId }
    }
    case 'rename':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, title: action.title } : s)) }
    case 'setActive':
      return state.sessions.some((s) => s.id === action.id) ? { ...state, activeId: action.id } : state
    case 'patch':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) }
    case 'openTableTab': {
      // Dedupe: same table on same connection → focus it + switch sub-tab, don't reopen.
      const existing = state.sessions.find(
        (s) => s.table?.table === action.session.table && s.table?.connectionId === action.session.connectionId,
      )
      if (existing) {
        return {
          ...state,
          activeId: existing.id,
          sessions: state.sessions.map((s) =>
            s.id === existing.id && s.table != null
              ? { ...s, table: { ...s.table, subTab: action.session.subTab, ...contentPatch(action.session) } }
              : s,
          ),
        }
      }
      const seq = state.seq + 1
      const s: QuerySession = { ...emptySession(seq), title: action.session.table, table: action.session }
      return { sessions: [...state.sessions, s], activeId: s.id, seq }
    }
    case 'setTableRows':
      return mapTable(state, action.id, (t) => ({ ...t, rows: action.rows }))
    case 'setContentSort':
      // Commit the re-fetched rows together with the sort state and the SQL that produced
      // them, so a later save replays the same sorted/limited view.
      return mapTable(state, action.id, (t) => ({ ...t, sortField: action.sortField, sortDir: action.sortDir, sql: action.sql, rows: action.rows }))
    case 'setSubTab':
      return mapTable(state, action.id, (t) => ({ ...t, subTab: action.subTab }))
    case 'setTableCache':
      return mapTable(state, action.id, (t) => ({ ...t, [action.key]: action.value }))
    case 'setSubTabError':
      return mapTable(state, action.id, (t) => ({ ...t, cacheErrors: { ...t.cacheErrors, [action.key]: action.error } }))
    case 'reset': {
      const seq = state.seq + 1
      const s = emptySession(seq)
      return { sessions: [s], activeId: s.id, seq }
    }
    default:
      return state
  }
}

/** When re-focusing an existing table tab with content payload (edit flow), carry rows/sql/fields. */
function contentPatch(next: TableSession): Partial<TableSession> {
  const patch: Partial<TableSession> = {}
  if (next.rows !== undefined) patch.rows = next.rows
  if (next.sql !== undefined) patch.sql = next.sql
  if (next.fields !== undefined) patch.fields = next.fields
  return patch
}
