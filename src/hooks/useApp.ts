import { useCallback, useRef, useState } from 'react'
import { client as defaultClient, ApiError, type DbClient } from '../api/client'
import { useConnections, toApiError, type ConnectionsApi } from './useConnections'
import { useHistory, type HistoryApi } from './useHistory'
import { useTabs, type TabsApi } from './useTabs'
import { useWorkspaces, type WorkspacesApi } from './useWorkspaces'
import { detectSingleTable, resultIsEditable } from './single-table'
import { buildBrowseSql, buildCountSql, parseTotal, type ContentFilter } from '../views/content-query'
import type { MutateOps, SubTab } from '../api/types'
import type { LazyKey, TableSession } from './tabs-reducer'
import type { SortDir } from '../views/grid-virtual'

// Build the full-table browse SQL for a content session, carrying its current sort/filter/page.
function browseSqlFor(t: TableSession, over: Partial<{ filter: ContentFilter | null; page: number }> = {}): string {
  return buildBrowseSql(t.table, {
    sortField: t.sortField ?? null,
    sortDir: t.sortDir ?? null,
    filter: 'filter' in over ? over.filter ?? null : t.filter ?? null,
    page: 'page' in over ? over.page : t.page ?? 0,
  })
}

export interface AppApi {
  connections: ConnectionsApi
  history: HistoryApi
  tabs: TabsApi
  workspaces: WorkspacesApi
  saving: boolean
  exportResult(format: 'csv' | 'json'): Promise<void>
  openTableTab(table: string, subTab?: SubTab): Promise<void>
  loadSubTab(tabId: string, key: LazyKey): Promise<void>
  loadContent(tabId: string): Promise<void>
  loadContentCount(tabId: string): Promise<void>
  sortContent(tabId: string, field: string, dir: SortDir): Promise<void>
  setContentFilter(tabId: string, filter: ContentFilter | null): Promise<void>
  setContentPage(tabId: string, page: number): Promise<void>
  saveTableEdits(table: string, ops: MutateOps): Promise<boolean>
  editQueryResult(): Promise<void>
  switchWorkspace(id: string): Promise<void>
  removeWorkspace(id: string): Promise<void>
}

export function useApp(client: DbClient = defaultClient): AppApi {
  const connections = useConnections(client)
  const history = useHistory()
  const tabs = useTabs({ client: connections.client, activeConnectionId: connections.activeConnectionId, onRecord: history.add })
  const workspaces = useWorkspaces(connections.client)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef<Set<string>>(new Set())

  const exportResult = useCallback(async (format: 'csv' | 'json') => {
    const connId = connections.activeConnectionId
    const sql = tabs.active.sql
    if (!connId || sql.trim() === '') return
    try {
      await connections.client.exportRows(connId, sql, format)
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs.active.sql])

  const openTableTab = useCallback(async (table: string, subTab: SubTab = 'structure') => {
    const connId = connections.activeConnectionId
    if (!connId) return
    try {
      const schema = await connections.client.schemaTable(connId, table)
      // `table` is a server-enumerated identifier from the schema tree (not free user input).
      const sql = buildBrowseSql(table)
      // Content sub-tab needs rows up front so the browser renders immediately.
      const rows = subTab === 'content' ? (await connections.client.query(connId, sql)).rows : undefined
      tabs.openTableTab({ connectionId: connId, table, schema, subTab, sql, rows })
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs.openTableTab])

  // Lazy-load a sub-tab's data the first time it is shown. Errors are scoped to the
  // sub-tab (stored on the session) so one failure never blanks the others.
  const loadSubTab = useCallback(async (tabId: string, key: LazyKey) => {
    const connId = connections.activeConnectionId
    const session = tabs.getSession(tabId)
    const t = session?.table
    if (!connId || !t) return
    if (t[key] !== undefined) return // cache hit; a prior error leaves t[key] undefined → revisiting retries
    const flightKey = `${tabId}:${key}`
    if (inFlight.current.has(flightKey)) return // a fetch for this sub-tab is already running
    inFlight.current.add(flightKey)
    try {
      const value =
        key === 'triggers' ? await connections.client.tableTriggers(connId, t.table)
        : key === 'info' ? await connections.client.tableInfo(connId, t.table)
        : await connections.client.tableRelations(connId, t.table)
      tabs.setTableCache(tabId, key, value)
    } catch (err) {
      const e = toApiError(err)
      tabs.setSubTabError(tabId, key, { code: e.code, message: e.message, status: e.status })
    } finally {
      inFlight.current.delete(flightKey)
    }
  }, [connections, tabs.getSession, tabs.setTableCache, tabs.setSubTabError])

  // Content rows are fetched up front only when a tab opens directly on Content (the
  // pencil affordance). A tab opened on Structure (table-name click) carries no rows, so
  // navigating to the Content sub-tab must fetch them on demand — mirroring the lazy
  // sub-tabs. undefined rows = not loaded; an empty table legitimately yields [].
  const loadContent = useCallback(async (tabId: string) => {
    const connId = connections.activeConnectionId
    const session = tabs.getSession(tabId)
    const t = session?.table
    if (!connId || !t || t.rows !== undefined) return // cache hit (incl. empty result)
    const flightKey = `${tabId}:content`
    if (inFlight.current.has(flightKey)) return // a fetch for this tab's content is already running
    inFlight.current.add(flightKey)
    try {
      const sql = t.sql ?? browseSqlFor(t)
      const res = await connections.client.query(connId, sql)
      tabs.setTableRows(tabId, res.rows)
    } catch (err) {
      connections.setError(toApiError(err))
    } finally {
      inFlight.current.delete(flightKey)
    }
  }, [connections, tabs.getSession, tabs.setTableRows])

  // Count the rows behind the current filter so the pager can show "n–m / total". Runs once
  // per (table, filter) for a full-table browse; an arbitrary-SQL edit tab (fields set) has no
  // pagination, so it never counts. Deduped on its own in-flight key, independent of the rows.
  const loadContentCount = useCallback(async (tabId: string) => {
    const connId = connections.activeConnectionId
    const session = tabs.getSession(tabId)
    const t = session?.table
    if (!connId || !t || t.fields !== undefined || t.total !== undefined) return
    const flightKey = `${tabId}:count`
    if (inFlight.current.has(flightKey)) return
    inFlight.current.add(flightKey)
    try {
      const res = await connections.client.query(connId, buildCountSql(t.table, t.filter ?? null))
      tabs.setContentTotal(tabId, parseTotal(res))
    } catch {
      // A failed count must not blank the rows; mark it counted-but-unknown to stop retry loops.
      tabs.setContentTotal(tabId, null)
    } finally {
      inFlight.current.delete(flightKey)
    }
  }, [connections, tabs.getSession, tabs.setContentTotal])

  // Re-fetch the content rows ordered by a clicked column (server-side ORDER BY), so the
  // sort spans the whole table rather than just the loaded 200 rows. Only a full-table
  // browse is reordered; an arbitrary-SQL edit tab (fields set) keeps its own SQL untouched.
  const sortContent = useCallback(async (tabId: string, field: string, dir: SortDir) => {
    const connId = connections.activeConnectionId
    const session = tabs.getSession(tabId)
    const t = session?.table
    if (!connId || !t || t.fields !== undefined) return
    const sortField = dir ? field : null
    // Re-sorting reorders the whole filtered table, so reset to page 0 but keep the filter.
    const sql = buildBrowseSql(t.table, { sortField, sortDir: dir, filter: t.filter ?? null, page: 0 })
    try {
      const res = await connections.client.query(connId, sql)
      tabs.setContentSort(tabId, sortField, dir, sql, res.rows)
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs.getSession, tabs.setContentSort])

  // Apply (or clear) the content filter bar: re-fetch page 0 of the filtered rows and the new
  // total in parallel. Browse-only — an arbitrary-SQL edit tab keeps its own SQL.
  const setContentFilter = useCallback(async (tabId: string, filter: ContentFilter | null) => {
    const connId = connections.activeConnectionId
    const session = tabs.getSession(tabId)
    const t = session?.table
    if (!connId || !t || t.fields !== undefined) return
    const sql = browseSqlFor(t, { filter, page: 0 })
    try {
      const [res, countRes] = await Promise.all([
        connections.client.query(connId, sql),
        connections.client.query(connId, buildCountSql(t.table, filter)),
      ])
      tabs.setContentFilter(tabId, filter, sql, res.rows, parseTotal(countRes))
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs.getSession, tabs.setContentFilter])

  // Jump to a 0-based page: re-fetch with OFFSET, carrying the current sort + filter. The total
  // is unchanged by paging, so no recount.
  const setContentPage = useCallback(async (tabId: string, page: number) => {
    const connId = connections.activeConnectionId
    const session = tabs.getSession(tabId)
    const t = session?.table
    if (!connId || !t || t.fields !== undefined) return
    const sql = browseSqlFor(t, { page })
    try {
      const res = await connections.client.query(connId, sql)
      tabs.setContentPage(tabId, page, sql, res.rows)
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs.getSession, tabs.setContentPage])

  // Stage two: open the active arbitrary-SQL result for editing when it is a plain
  // single-table SELECT whose primary key is projected. The structural detection is
  // cheap and gates the UI affordance; the schema fetch + editability gate run here on
  // demand to avoid eagerly fetching a schema for every query.
  const editQueryResult = useCallback(async () => {
    const connId = connections.activeConnectionId
    const session = tabs.active
    // Use the SQL that produced the result, not the live (possibly retyped) editor text.
    const sql = session.executedSql
    const result = session.result
    if (!connId || result == null) return
    const table = detectSingleTable(sql)
    if (table == null) return
    try {
      const schema = await connections.client.schemaTable(connId, table)
      if (!resultIsEditable(schema, result.fields)) {
        connections.setError(new ApiError('NOT_EDITABLE', '此查詢結果無法編輯:需為含主鍵的單表 SELECT,且主鍵欄位在結果中。', 400))
        return
      }
      tabs.openTableTab({ connectionId: connId, table, schema, subTab: 'content', rows: result.rows, sql, fields: result.fields })
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs.active, tabs.openTableTab])

  const saveTableEdits = useCallback(async (table: string, ops: MutateOps): Promise<boolean> => {
    const connId = connections.activeConnectionId
    if (!connId) return false
    const tabId = tabs.activeId
    // Replay the session's own fetch query so an edited arbitrary SELECT refreshes the
    // same filtered view rather than a full-table scan.
    const refetchSql = tabs.active.table?.sql ?? buildBrowseSql(table)
    setSaving(true)
    try {
      await connections.client.mutate(connId, table, ops)
      const result = await connections.client.query(connId, refetchSql)
      tabs.setTableRows(tabId, result.rows)
      return true
    } catch (err) {
      connections.setError(toApiError(err))
      return false
    } finally {
      setSaving(false)
    }
  }, [connections, tabs.activeId, tabs.active.table, tabs.setTableRows])

  const switchWorkspace = useCallback(async (id: string) => {
    try {
      const conns = await workspaces.select(id)
      connections.resetForWorkspace(conns)
      tabs.resetAll()
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [workspaces, connections, tabs])

  const removeWorkspace = useCallback(async (id: string) => {
    // 若移除的是目前作用中的 workspace,伺服器會自動切回全域並回傳新連線清單;
    // 前端需同步重置 connections/schema/分頁,與 switchWorkspace 一致。
    const conns = await workspaces.remove(id)
    if (conns) {
      connections.resetForWorkspace(conns)
      tabs.resetAll()
    }
  }, [workspaces, connections, tabs])

  return { connections, history, tabs, workspaces, saving, exportResult, openTableTab, loadSubTab, loadContent, loadContentCount, sortContent, setContentFilter, setContentPage, saveTableEdits, editQueryResult, switchWorkspace, removeWorkspace }
}
