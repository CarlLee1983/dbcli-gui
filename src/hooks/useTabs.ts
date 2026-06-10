import { useCallback, useReducer, useRef } from 'react'
import { ApiError, type DbClient } from '../api/client'
import type { SortDir } from '../views/grid-virtual'
import { toApiError } from './useConnections'
import type { HistoryEntry } from './useHistory'
import { tabsReducer, initTabs, type QuerySession, type BrowseSession } from './tabs-reducer'

export interface UseTabsOpts {
  client: DbClient
  activeConnectionId: string | null
  onRecord(entry: HistoryEntry): void
}

export interface TabsApi {
  sessions: QuerySession[]
  activeId: string
  active: QuerySession
  openTab(): void
  closeTab(id: string): void
  renameTab(id: string, title: string): void
  setActive(id: string): void
  setSql(sql: string): void
  loadSql(sql: string): void
  setSort(field: string | null, dir: SortDir): void
  setResultFilter(filter: string): void
  runQuery(): Promise<void>
  dismissError(): void
  openBrowse(browse: BrowseSession): void
  setBrowseRows(id: string, rows: Array<Record<string, unknown>>): void
  resetAll(): void
}

export function useTabs(opts: UseTabsOpts): TabsApi {
  const [state, dispatch] = useReducer(tabsReducer, undefined, initTabs)
  const stateRef = useRef(state)
  stateRef.current = state
  const optsRef = useRef(opts)
  optsRef.current = opts

  // initTabs always provides at least one session, so the fallback is always defined
  const active = (state.sessions.find((s) => s.id === state.activeId) ?? state.sessions[0]) as QuerySession

  const patchActive = useCallback((patch: Partial<QuerySession>) => {
    dispatch({ type: 'patch', id: stateRef.current.activeId, patch })
  }, [])

  const setSql = useCallback((sql: string) => patchActive({ sql }), [patchActive])
  const loadSql = useCallback((sql: string) => patchActive({ sql }), [patchActive])
  const setSort = useCallback((sortField: string | null, sortDir: SortDir) => patchActive({ sortField, sortDir }), [patchActive])
  const setResultFilter = useCallback((resultFilter: string) => patchActive({ resultFilter }), [patchActive])
  const dismissError = useCallback(() => patchActive({ error: null }), [patchActive])

  const openTab = useCallback(() => dispatch({ type: 'open' }), [])
  const closeTab = useCallback((id: string) => dispatch({ type: 'close', id }), [])
  const renameTab = useCallback((id: string, title: string) => dispatch({ type: 'rename', id, title }), [])
  const setActive = useCallback((id: string) => dispatch({ type: 'setActive', id }), [])
  const openBrowse = useCallback((browse: BrowseSession) => dispatch({ type: 'openBrowse', browse }), [])
  const setBrowseRows = useCallback((id: string, rows: Array<Record<string, unknown>>) => dispatch({ type: 'setBrowseRows', id, rows }), [])
  const resetAll = useCallback(() => dispatch({ type: 'reset' }), [])

  const runQuery = useCallback(async () => {
    const { client, activeConnectionId, onRecord } = optsRef.current
    const id = stateRef.current.activeId
    const session = stateRef.current.sessions.find((s) => s.id === id)
    const connId = activeConnectionId
    const sql = session?.sql ?? ''
    if (!connId || sql.trim() === '') return
    dispatch({ type: 'patch', id, patch: { loading: true, error: null } })
    try {
      let res
      try {
        res = await client.query(connId, sql)
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NOT_OPEN') {
          await client.openConnection(connId)
          res = await client.query(connId, sql)
        } else {
          throw err
        }
      }
      dispatch({ type: 'patch', id, patch: { result: res, executedSql: sql, loading: false } })
      onRecord({ sql, connectionId: connId, ts: Date.now(), rowCount: res.rowCount })
    } catch (err) {
      dispatch({ type: 'patch', id, patch: { error: toApiError(err), loading: false } })
    }
  }, [])

  return {
    sessions: state.sessions, activeId: state.activeId, active,
    openTab, closeTab, renameTab, setActive,
    setSql, loadSql, setSort, setResultFilter, runQuery, dismissError,
    openBrowse, setBrowseRows, resetAll,
  }
}
