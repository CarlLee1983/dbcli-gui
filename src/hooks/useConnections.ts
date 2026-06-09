import { useCallback, useEffect, useRef, useState } from 'react'
import { client as defaultClient, ApiError, type DbClient } from '../api/client'
import type { ConnectionSummary, TreeTable, TableColumnDto, ConnectionFormInput, ConnectionDetail, TestResult } from '../api/types'

const INTERNAL_STATUS = 0 // no HTTP response (client-side / wrapped error)
export const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError('INTERNAL', err instanceof Error ? err.message : 'Unknown error', INTERNAL_STATUS)

export interface ConnectionsApi {
  online: boolean
  connections: ConnectionSummary[]
  activeConnectionId: string | null
  tree: TreeTable[]
  expandedColumns: Record<string, TableColumnDto[]>
  error: ApiError | null
  client: DbClient
  selectConnection(id: string): Promise<void>
  loadTableColumns(table: string): Promise<void>
  refreshConnections(): Promise<void>
  setError(err: ApiError | null): void
  dismissError(): void
  createConnection(input: ConnectionFormInput): Promise<void>
  updateConnection(input: ConnectionFormInput): Promise<void>
  deleteConnection(name: string): Promise<void>
  setDefault(name: string): Promise<void>
  testConnection(input: Omit<ConnectionFormInput, 'name'>): Promise<TestResult>
  getConnection(name: string): Promise<ConnectionDetail>
}

export function useConnections(client: DbClient = defaultClient): ConnectionsApi {
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
  const [error, setError] = useState<ApiError | null>(null)

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

  const dismissError = useCallback(() => setError(null), [])

  // Shared mutate helper: runs fn, refreshes the list on success, surfaces + rethrows on error.
  const mutate = useCallback(async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await refreshConnections()
    } catch (err) {
      const apiErr = toApiError(err)
      setError(apiErr)
      throw apiErr
    }
  }, [refreshConnections])

  const createConnection = useCallback(
    (input: ConnectionFormInput) => mutate(() => clientRef.current.createConnection(input)),
    [mutate],
  )
  const updateConnection = useCallback(
    (input: ConnectionFormInput) => mutate(() => clientRef.current.updateConnection(input)),
    [mutate],
  )
  const deleteConnection = useCallback(
    (name: string) => mutate(() => clientRef.current.deleteConnection(name)),
    [mutate],
  )
  const setDefault = useCallback(
    (name: string) => mutate(() => clientRef.current.setDefaultConnection(name)),
    [mutate],
  )
  const testConnection = useCallback(
    (input: Omit<ConnectionFormInput, 'name'>) => clientRef.current.testConnection(input),
    [],
  )
  const getConnection = useCallback(
    (name: string) => clientRef.current.getConnection(name),
    [],
  )

  return {
    online,
    connections,
    activeConnectionId,
    tree,
    expandedColumns,
    error,
    client: clientRef.current,
    selectConnection,
    loadTableColumns,
    refreshConnections,
    setError,
    dismissError,
    createConnection,
    updateConnection,
    deleteConnection,
    setDefault,
    testConnection,
    getConnection,
  }
}
