import { useCallback, useEffect, useRef, useState } from 'react'
import { client as defaultClient, type DbClient } from '../api/client'
import { toApiError } from './useConnections'
import type { Workspace, ConnectionSummary } from '../api/types'
import type { ApiError } from '../api/client'

export interface WorkspacesApi {
  workspaces: Workspace[]
  activeId: string | null
  error: ApiError | null
  refresh(): Promise<void>
  add(path: string, label?: string): Promise<void>
  remove(id: string): Promise<void>
  /** 切換成功回傳新 workspace 的連線清單，供呼叫端套用 + 重置狀態。 */
  select(id: string): Promise<ConnectionSummary[]>
}

export function useWorkspaces(client: DbClient = defaultClient): WorkspacesApi {
  // 穩定化 client 參照：callbacks 透過 ref 讀取，避免測試每次 render 傳入新物件時觸發 effect 迴圈
  const clientRef = useRef(client)
  clientRef.current = client

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const refresh = useCallback(async () => {
    try {
      const { workspaces, activeId } = await clientRef.current.listWorkspaces()
      setWorkspaces(workspaces)
      setActiveId(activeId)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [])

  // 掛載時自動載入 workspace 清單
  useEffect(() => { void refresh() }, [refresh])

  const add = useCallback(async (path: string, label?: string) => {
    try {
      const { workspaces } = await clientRef.current.addWorkspace(path, label)
      setWorkspaces(workspaces)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    try {
      const { workspaces, activeId } = await clientRef.current.removeWorkspace(id)
      setWorkspaces(workspaces)
      setActiveId(activeId)
    } catch (err) {
      setError(toApiError(err))
    }
  }, [])

  // select 不攔截錯誤：呼叫端（useApp.switchWorkspace）需要自行處理切換失敗並決定是否重置狀態
  const select = useCallback(async (id: string): Promise<ConnectionSummary[]> => {
    const { connections, activeId } = await clientRef.current.selectWorkspace(id)
    setActiveId(activeId)
    return connections
  }, [])

  return { workspaces, activeId, error, refresh, add, remove, select }
}
