import { useCallback, useState } from 'react'
import { client as defaultClient, ApiError, type DbClient } from '../api/client'
import { useConnections, toApiError, type ConnectionsApi } from './useConnections'
import { useHistory, type HistoryApi } from './useHistory'
import { useTabs, type TabsApi } from './useTabs'
import { detectSingleTable, resultIsEditable } from './single-table'
import type { MutateOps } from '../api/types'

export interface AppApi {
  connections: ConnectionsApi
  history: HistoryApi
  tabs: TabsApi
  saving: boolean
  exportResult(format: 'csv' | 'json'): Promise<void>
  browseTable(table: string): Promise<void>
  saveTableEdits(table: string, ops: MutateOps): Promise<boolean>
  editQueryResult(): Promise<void>
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
      // `table` is a server-enumerated identifier from the schema tree (not free user input).
      // TODO(stage-two): quote the identifier to support reserved-word / special-char table names.
      const sql = `SELECT * FROM ${table} LIMIT 200`
      const result = await connections.client.query(connId, sql)
      tabs.openBrowse({ table, schema, rows: result.rows, sql })
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs.openBrowse])

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
      tabs.openBrowse({ table, schema, rows: result.rows, sql, fields: result.fields })
    } catch (err) {
      connections.setError(toApiError(err))
    }
  }, [connections, tabs.active, tabs.openBrowse])

  const saveTableEdits = useCallback(async (table: string, ops: MutateOps): Promise<boolean> => {
    const connId = connections.activeConnectionId
    if (!connId) return false
    const tabId = tabs.activeId
    // Replay the session's own fetch query so an edited arbitrary SELECT refreshes the
    // same filtered view rather than a full-table scan.
    const refetchSql = tabs.active.browse?.sql ?? `SELECT * FROM ${table} LIMIT 200`
    setSaving(true)
    try {
      await connections.client.mutate(connId, table, ops)
      const result = await connections.client.query(connId, refetchSql)
      tabs.setBrowseRows(tabId, result.rows)
      return true
    } catch (err) {
      connections.setError(toApiError(err))
      return false
    } finally {
      setSaving(false)
    }
  }, [connections, tabs.activeId, tabs.active.browse, tabs.setBrowseRows])

  return { connections, history, tabs, saving, exportResult, browseTable, saveTableEdits, editQueryResult }
}
