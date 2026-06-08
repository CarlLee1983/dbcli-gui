import { test, expect } from 'bun:test'
import { ConnectionPool } from '../../sidecar/connection-pool'
import type { DatabaseAdapter, DbcliConfig } from '@carllee1983/dbcli/core'

function fakeAdapter(events: string[]): DatabaseAdapter {
  return {
    connect: async () => { events.push('connect') },
    disconnect: async () => { events.push('disconnect') },
    execute: async () => ({ rows: [] }),
  } as unknown as DatabaseAdapter
}

const fakeConfig = { connection: { system: 'postgresql' }, permission: 'read-write' } as unknown as DbcliConfig

test('open connects an adapter and get returns the entry', async () => {
  const events: string[] = []
  const pool = new ConnectionPool({
    loadConfig: async () => fakeConfig,
    openAdapter: () => fakeAdapter(events),
  })
  const entry = await pool.open('main')
  expect(entry.config).toBe(fakeConfig)
  expect(events).toContain('connect')
  expect(pool.get('main')).toBe(entry)
})

test('open is idempotent — second open reuses the same entry (no reconnect)', async () => {
  const events: string[] = []
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter(events) })
  const a = await pool.open('main')
  const b = await pool.open('main')
  expect(b).toBe(a)
  expect(events.filter((e) => e === 'connect').length).toBe(1)
})

test('close disconnects and removes the entry', async () => {
  const events: string[] = []
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter(events) })
  await pool.open('main')
  await pool.close('main')
  expect(events).toContain('disconnect')
  expect(pool.get('main')).toBeUndefined()
})

test('closeAll disconnects and removes every open connection', async () => {
  const events: string[] = []
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter(events) })
  await pool.open('a')
  await pool.open('b')
  await pool.closeAll()
  expect(events.filter((e) => e === 'disconnect').length).toBe(2)
  expect(pool.get('a')).toBeUndefined()
  expect(pool.get('b')).toBeUndefined()
})

test('get throws-free for unknown id; close on unknown id is a no-op', async () => {
  const pool = new ConnectionPool({ loadConfig: async () => fakeConfig, openAdapter: () => fakeAdapter([]) })
  expect(pool.get('nope')).toBeUndefined()
  await pool.close('nope') // must not throw
})
