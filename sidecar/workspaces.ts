import { join, basename } from 'node:path'

/** 單一 workspace 的描述。global workspace 為隱含項,不寫入檔案。 */
export interface Workspace {
  id: string
  label: string
  kind: 'global' | 'project'
  /** dbcliPath:global = globalDir;project = <folder>/.dbcli */
  path: string
}

/** workspaces.json 的結構;只儲存專案清單與最後使用的 id。 */
export interface WorkspacesFile {
  version: 1
  lastActiveId: string
  /** 只存專案;global 為隱含固定項,不寫檔。 */
  workspaces: Workspace[]
}

/** 全域 workspace 的固定 id。 */
export const GLOBAL_ID = 'global'

/** 依 globalDir 動態產生 global workspace 描述(不持久化)。 */
export function globalWorkspace(globalDir: string): Workspace {
  return { id: GLOBAL_ID, label: '全域', kind: 'global', path: globalDir }
}

/** 建立空的 WorkspacesFile 預設值;lastActiveId 指向 global。 */
export function defaultWorkspacesFile(): WorkspacesFile {
  return { version: 1, lastActiveId: GLOBAL_ID, workspaces: [] }
}

/** global 永遠第一個,後接已加入的專案。純函式,回傳新陣列。 */
export function listWorkspaces(file: WorkspacesFile, globalDir: string): Workspace[] {
  return [globalWorkspace(globalDir), ...file.workspaces]
}

/** 新增或覆寫(同 id)一個專案 workspace。純函式。 */
export function addWorkspace(file: WorkspacesFile, ws: Workspace): WorkspacesFile {
  return { ...file, workspaces: [...file.workspaces.filter((w) => w.id !== ws.id), ws] }
}

/**
 * 移除一個專案 workspace。
 * - 不允許移除 global(丟錯)。
 * - 若被移除的是 lastActive,自動退回 global。
 */
export function removeWorkspace(file: WorkspacesFile, id: string): WorkspacesFile {
  if (id === GLOBAL_ID) throw new Error('cannot remove the global workspace')
  return {
    ...file,
    lastActiveId: file.lastActiveId === id ? GLOBAL_ID : file.lastActiveId,
    workspaces: file.workspaces.filter((w) => w.id !== id),
  }
}

/** 更新 lastActiveId。純函式。 */
export function setLastActive(file: WorkspacesFile, id: string): WorkspacesFile {
  return { ...file, lastActiveId: id }
}

/**
 * 將 workspace id 解析為 dbcli 目錄路徑。
 * - global → globalDir
 * - 專案 id → 其 path
 * - 未知 id → 丟錯
 */
export function resolvePath(file: WorkspacesFile, id: string, globalDir: string): string {
  if (id === GLOBAL_ID) return globalDir
  const ws = file.workspaces.find((w) => w.id === id)
  if (!ws) throw new Error(`unknown workspace: ${id}`)
  return ws.path
}

/**
 * 從資料夾路徑建立新的專案 workspace。
 * - label 預設取資料夾名稱
 * - path 指向 <folder>/.dbcli
 * - id 每次呼叫都唯一(crypto.randomUUID)
 */
export function makeProjectWorkspace(folder: string, label?: string): Workspace {
  return {
    id: crypto.randomUUID(),
    label: label ?? basename(folder),
    kind: 'project',
    path: join(folder, '.dbcli'),
  }
}
