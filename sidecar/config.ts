import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export interface SidecarConfig {
  workdir: string
  dbcliPath: string
  port: number
  token: string
}

/** Resolve sidecar runtime config from an env-like record (defaults applied). */
export function resolveSidecarConfig(env: Record<string, string | undefined> = process.env): SidecarConfig {
  const workdir = env.DBCLI_GUI_WORKDIR ?? process.cwd()
  return {
    workdir,
    dbcliPath: join(workdir, '.dbcli'),
    port: env.DBCLI_GUI_PORT ? parseInt(env.DBCLI_GUI_PORT, 10) : 0,
    token: env.DBCLI_GUI_TOKEN ?? randomBytes(24).toString('hex'),
  }
}
