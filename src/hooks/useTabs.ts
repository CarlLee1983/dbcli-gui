import { useCallback, useReducer, useRef } from 'react'
import { ApiError, type DbClient } from '../api/client'
import type { SortDir } from '../views/grid-virtual'
import { toApiError } from './useConnections'
import type { HistoryEntry } from './useHistory'
import { tabsReducer, initTabs, type QuerySession, type TableSession, type LazyKey, type SubTabError } from './tabs-reducer'
import type { ContentFilter } from '../views/content-query'
import type { SubTab, TriggerDto, TableInfoDto, RelationsDto } from '../api/types'

export interface UseTabsOpts {
  client: DbClient
  activeConnectionId: string | null
  onRecord(entry: HistoryEntry): void
}

export interface TabsApi {
  sessions: QuerySession[]
  activeId: string
  active: QuerySession
  getSession(id: string): QuerySession | undefined
  openTab(): void
  openQuery(sql: string): void
  closeTab(id: string): void
  renameTab(id: string, title: string): void
  setActive(id: string): void
  setSql(sql: string): void
  loadSql(sql: string): void
  setSort(field: string | null, dir: SortDir): void
  setResultFilter(filter: string): void
  runQuery(): Promise<void>
  dismissError(): void
  openTableTab(session: TableSession): void
  setTableRows(id: string, rows: Array<Record<string, unknown>>): void
  setContentSort(id: string, sortField: string | null, sortDir: SortDir, sql: string, rows: Array<Record<string, unknown>>): void
  setContentFilter(id: string, filter: ContentFilter | null, sql: string, rows: Array<Record<string, unknown>>, total: number | null): void
  setContentPage(id: string, page: number, sql: string, rows: Array<Record<string, unknown>>): void
  setContentTotal(id: string, total: number | null): void
  setSubTab(id: string, subTab: SubTab): void
  setTableCache(id: string, key: LazyKey, value: TriggerDto[] | TableInfoDto | RelationsDto): void
  setSubTabError(id: string, key: LazyKey, error: SubTabError): void
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

  const getSession = useCallback((id: string) => stateRef.current.sessions.find((s) => s.id === id), [])
  const openTab = useCallback(() => dispatch({ type: 'open' }), [])
  const openQuery = useCallback((sql: string) => dispatch({ type: 'open', sql }), [])
  const closeTab = useCallback((id: string) => dispatch({ type: 'close', id }), [])
  const renameTab = useCallback((id: string, title: string) => dispatch({ type: 'rename', id, title }), [])
  const setActive = useCallback((id: string) => dispatch({ type: 'setActive', id }), [])
  const openTableTab = useCallback((session: TableSession) => dispatch({ type: 'openTableTab', session }), [])
  const setTableRows = useCallback((id: string, rows: Array<Record<string, unknown>>) => dispatch({ type: 'setTableRows', id, rows }), [])
  const setContentSort = useCallback((id: string, sortField: string | null, sortDir: SortDir, sql: string, rows: Array<Record<string, unknown>>) => dispatch({ type: 'setContentSort', id, sortField, sortDir, sql, rows }), [])
  const setContentFilter = useCallback((id: string, filter: ContentFilter | null, sql: string, rows: Array<Record<string, unknown>>, total: number | null) => dispatch({ type: 'setContentFilter', id, filter, sql, rows, total }), [])
  const setContentPage = useCallback((id: string, page: number, sql: string, rows: Array<Record<string, unknown>>) => dispatch({ type: 'setContentPage', id, page, sql, rows }), [])
  const setContentTotal = useCallback((id: string, total: number | null) => dispatch({ type: 'setContentTotal', id, total }), [])
  const setSubTab = useCallback((id: string, subTab: SubTab) => dispatch({ type: 'setSubTab', id, subTab }), [])
  const setTableCache = useCallback((id: string, key: LazyKey, value: TriggerDto[] | TableInfoDto | RelationsDto) => dispatch({ type: 'setTableCache', id, key, value }), [])
  const setSubTabError = useCallback((id: string, key: LazyKey, error: SubTabError) => dispatch({ type: 'setSubTabError', id, key, error }), [])
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
    sessions: state.sessions, activeId: state.activeId, active, getSession,
    openTab, openQuery, closeTab, renameTab, setActive,
    setSql, loadSql, setSort, setResultFilter, runQuery, dismissError,
    openTableTab, setTableRows, setContentSort, setContentFilter, setContentPage, setContentTotal, setSubTab, setTableCache, setSubTabError, resetAll,
  }
}
