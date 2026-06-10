import type { QueryResultDto, TableSchemaDto } from '../api/types'
import type { SortDir } from '../views/grid-virtual'
import type { ApiError } from '../api/client'

export interface BrowseSession {
  table: string
  schema: TableSchemaDto
  rows: Array<Record<string, unknown>>
}

export interface QuerySession {
  id: string
  title: string
  sql: string
  result: QueryResultDto | null
  sortField: string | null
  sortDir: SortDir | null
  resultFilter: string
  loading: boolean
  error: ApiError | null
  browse: BrowseSession | null
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
    result: null,
    sortField: null,
    sortDir: null,
    resultFilter: '',
    loading: false,
    error: null,
    browse: null,
  }
}

export function initTabs(): TabsState {
  const first = emptySession(1)
  return { sessions: [first], activeId: first.id, seq: 1 }
}

export type TabsAction =
  | { type: 'open' }
  | { type: 'close'; id: string }
  | { type: 'rename'; id: string; title: string }
  | { type: 'setActive'; id: string }
  | { type: 'patch'; id: string; patch: Partial<QuerySession> }
  | { type: 'openBrowse'; browse: BrowseSession }
  | { type: 'setBrowseRows'; id: string; rows: Array<Record<string, unknown>> }

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      const seq = state.seq + 1
      const s = emptySession(seq)
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
        const nextSession = remaining[nextIdx]
        activeId = nextSession!.id
      }
      return { ...state, sessions: remaining, activeId }
    }
    case 'rename':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, title: action.title } : s)) }
    case 'setActive':
      return state.sessions.some((s) => s.id === action.id) ? { ...state, activeId: action.id } : state
    case 'patch':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) }
    case 'openBrowse': {
      const seq = state.seq + 1
      const s: QuerySession = { ...emptySession(seq), title: action.browse.table, browse: action.browse }
      return { sessions: [...state.sessions, s], activeId: s.id, seq }
    }
    case 'setBrowseRows':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.id && s.browse != null
            ? { ...s, browse: { ...s.browse, rows: action.rows } }
            : s
        ),
      }
    default:
      return state
  }
}
