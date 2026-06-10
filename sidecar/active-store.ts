import { ConnectionPool, defaultPoolDeps } from './connection-pool'
import { defaultConnectionLister, type ConnectionLister } from './routes/connections'

/** runtime 切換時整組重建的兩件物事。 */
export interface StoreRuntime {
  pool: ConnectionPool
  lister: ConnectionLister
}

/** sidecar 目前指向的 config store(可變;workspace 切換時就地更新欄位)。 */
export interface ActiveStore {
  id: string
  dbcliPath: string
  pool: ConnectionPool
  /** undefined = 沒有配置 lister,/connections/list 回 501。 */
  lister: ConnectionLister | undefined
}

export function buildStoreRuntime(dbcliPath: string): StoreRuntime {
  return {
    pool: new ConnectionPool(defaultPoolDeps(dbcliPath)),
    lister: defaultConnectionLister(dbcliPath),
  }
}
