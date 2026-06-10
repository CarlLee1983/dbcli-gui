import { useCallback, useState } from 'react'
import { client as defaultClient, type DbClient } from '../api/client'
import { useConnections, toApiError, type ConnectionsApi } from './useConnections'
import { useHistory, type HistoryApi } from './useHistory'
import { useTabs, type TabsApi } from './useTabs'
import type { MutateOps } from '../api/types'

export interface AppApi {
  connections: ConnectionsApi
  history: HistoryApi
  tabs: TabsApi
  saving: boolean
  exportResult(format: 'csv' | 'json'): Promise<void>
  browseTable(table: string): Promise<void>
  saveTableEdits(table: string, ops: MutateOps): Promise<void>
}

export function useApp(client: DbClient = defaultClient): AppApi {
  const connections = useConnections(client)
  const history = useHistory()
  const tabs = useTabs({ client: connections.client, activeConnectionId: connections.activeConnectionId, onRecord: history.add })
  const [saving, setSaving] = useState(false)

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

  const browseTable = useCallback(async (table: string) => {
    const connId = connections.activeConnectionId
    if (!connId) return
    try {
      const schema = await connections.client.schemaTable(connId, table)
      const result = await connections.client.query(connId, `SELECT * FROM ${table} LIMIT 200`)
      tabs.openBrowse({ table, schema, rows: result.rows })
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs])

  const saveTableEdits = useCallback(async (table: string, ops: MutateOps) => {
    const connId = connections.activeConnectionId
    if (!connId) return
    const tabId = tabs.activeId
    setSaving(true)
    try {
      await connections.client.mutate(connId, table, ops)
      const result = await connections.client.query(connId, `SELECT * FROM ${table} LIMIT 200`)
      tabs.setBrowseRows(tabId, result.rows)
    } catch (err) {
      connections.setError(toApiError(err))
    } finally {
      setSaving(false)
    }
  }, [connections, tabs])

  return { connections, history, tabs, saving, exportResult, browseTable, saveTableEdits }
}
