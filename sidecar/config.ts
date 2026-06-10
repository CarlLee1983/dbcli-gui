import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'

export interface SidecarConfig {
  /** 全域連線庫目錄(預設 ~/.dbcli)。也是 workspaces.json 的所在。 */
  globalDir: string
  port: number
  token: string
}

/** Resolve sidecar runtime config from an env-like record (defaults applied). */
export function resolveSidecarConfig(env: Record<string, string | undefined> = process.env): SidecarConfig {
  return {
    globalDir: env.DBCLI_GUI_GLOBAL_DIR ?? join(homedir(), '.dbcli'),
    port: env.DBCLI_GUI_PORT ? parseInt(env.DBCLI_GUI_PORT, 10) : 0,
    token: env.DBCLI_GUI_TOKEN ?? randomBytes(24).toString('hex'),
  }
}
