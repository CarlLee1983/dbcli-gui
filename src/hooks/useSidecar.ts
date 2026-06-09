import { useCallback, useEffect, useRef, useState } from 'react'
import { client as defaultClient, ApiError, type DbClient } from '../api/client'
import type { ConnectionSummary, QueryResultDto, TreeTable, TableColumnDto } from '../api/types'
import { useHistory, type HistoryApi } from './useHistory'

export interface SidecarState {
  online: boolean
  connections: ConnectionSummary[]
  activeConnectionId: string | null
  tree: TreeTable[]
  expandedColumns: Record<string, TableColumnDto[]>
  sql: string
  result: QueryResultDto | null
  error: ApiError | null
  loading: boolean
}

export interface SidecarApi extends SidecarState {
  refreshConnections(): Promise<void>
  selectConnection(id: string): Promise<void>
  loadTableColumns(table: string): Promise<void>
  setSql(sql: string): void
  runQuery(): Promise<void>
  insertSelect(table: string): void
  exportResult(format: 'csv' | 'json'): Promise<void>
  dismissError(): void
  history: HistoryApi
  loadFromHistory(sql: string): void
}

const INTERNAL_STATUS = 0 // no HTTP response (client-side / wrapped error)
const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError('INTERNAL', err instanceof Error ? err.message : 'Unknown error', INTERNAL_STATUS)

export function useSidecar(client: DbClient = defaultClient): SidecarApi {
  // Stabilise the client reference: the mount effect and callbacks always read
  // through the ref, so a new-object-per-render caller (e.g. test helpers) does
  // not trigger an infinite effect loop.
  const clientRef = useRef(client)
  clientRef.current = client

  const [online, setOnline] = useState(false)
  const [connections, setConnections] = useState<ConnectionSummary[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeTable[]>([])
  const [expandedColumns, setExpandedColumns] = useState<Record<string, TableColumnDto[]>>({})
  const [sql, setSql] = useState('')
  const [result, setResult] = useState<QueryResultDto | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(false)

  const history = useHistory()

  const refreshConnections = useCallback(async () => {
    try {
      const { connections } = await clientRef.current.listConnections()
      setConnections(connections)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await clientRef.current.health()
        if (cancelled) return
        setOnline(true)
        await refreshConnections()
      } catch {
        if (!cancelled) setOnline(false)
      }
    })()
    return () => { cancelled = true }
  }, [refreshConnections]) // stable: refreshConnections is memoised with [] deps, so this runs once

  const selectConnection = useCallback(async (id: string) => {
    setError(null)
    try {
      await clientRef.current.openConnection(id)
      const { tables } = await clientRef.current.schemaTree(id)
      setActiveConnectionId(id)
      setExpandedColumns({})
      setTree(tables)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [])

  const loadTableColumns = useCallback(async (table: string) => {
    const connId = activeConnectionId
    if (!connId) return
    try {
      const schema = await clientRef.current.schemaTable(connId, table)
      setExpandedColumns((prev) => ({ ...prev, [table]: schema.columns }))
    } catch (err) {
      setError(toApiError(err))
    }
  }, [activeConnectionId])

  const runQuery = useCallback(async () => {
    const connId = activeConnectionId
    const currentSql = sql
    if (!connId || currentSql.trim() === '') return
    setLoading(true)
    setError(null)
    try {
      let res: QueryResultDto
      try {
        res = await clientRef.current.query(connId, currentSql)
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NOT_OPEN') {
          await clientRef.current.openConnection(connId)
          res = await clientRef.current.query(connId, currentSql)
        } else {
          throw err
        }
      }
      setResult(res)
      history.add({ sql: currentSql, connectionId: connId, ts: Date.now(), rowCount: res.rowCount })
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setLoading(false)
    }
  }, [activeConnectionId, sql, history])

  const insertSelect = useCallback((table: string) => {
    setSql(`SELECT * FROM ${table} LIMIT 100`)
  }, [])

  const exportResult = useCallback(async (format: 'csv' | 'json') => {
    const connId = activeConnectionId
    const currentSql = sql
    if (!connId || currentSql.trim() === '') return
    try {
      await clientRef.current.exportRows(connId, currentSql, format)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [activeConnectionId, sql])

  const dismissError = useCallback(() => setError(null), [])

  const loadFromHistory = useCallback((value: string) => setSql(value), [])

  return {
    // state
    online, connections, activeConnectionId, tree, expandedColumns, sql, result, error, loading,
    // actions
    refreshConnections, selectConnection, loadTableColumns, setSql,
    runQuery, insertSelect, exportResult, dismissError,
    history, loadFromHistory,
  }
}
