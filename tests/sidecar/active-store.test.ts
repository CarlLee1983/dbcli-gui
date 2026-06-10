import { test, expect } from 'bun:test'
import { buildStoreRuntime } from '../../sidecar/active-store'
import { ConnectionPool } from '../../sidecar/connection-pool'

test('buildStoreRuntime 回傳綁同一 dbcliPath 的 pool 與 lister', () => {
  const rt = buildStoreRuntime('/tmp/does-not-exist/.dbcli')
  expect(rt.pool).toBeInstanceOf(ConnectionPool)
  expect(typeof rt.lister).toBe('function')
})
