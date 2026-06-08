import { useCallback, useEffect, useRef, useState } from 'react'
import { client as defaultClient, ApiError, type DbClient } from '../api/client'
import type { ConnectionSummary, QueryResultDto, TreeTable, TableColumnDto } from '../api/types'

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
}

const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError('INTERNAL', err instanceof Error ? err.message : 'Unknown error', 0)

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

  const refreshConnections = useCallback(async () => {
    const { connections } = await clientRef.current.listConnections()
    setConnections(connections)
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
  }, [refreshConnections])

  const selectConnection = useCallback(async (id: string) => {
    setError(null)
    try {
      await clientRef.current.openConnection(id)
      setActiveConnectionId(id)
      setExpandedColumns({})
      const { tables } = await clientRef.current.schemaTree(id)
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
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setLoading(false)
    }
  }, [activeConnectionId, sql])

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

  return {
    online, connections, activeConnectionId, tree, expandedColumns, sql, result, error, loading,
    refreshConnections, selectConnection, loadTableColumns, setSql, runQuery, insertSelect, exportResult, dismissError,
  }
}
