import { test, expect } from 'bun:test'
import { defaultConnectionLister, type ListerDeps } from '../../sidecar/routes/connections'

/** Build deps with overrides; unspecified hooks throw so a test fails loudly if the
 *  lister takes an unexpected branch. */
function deps(over: Partial<ListerDeps>): ListerDeps {
  return {
    readRawConfig: async () => { throw new Error('readRawConfig not stubbed') },
    detectVersion: () => { throw new Error('detectVersion not stubbed') },
    listV2: async () => { throw new Error('listV2 not stubbed') },
    readV1: async () => { throw new Error('readV1 not stubbed') },
    ...over,
  }
}

test('v2 config delegates to listV2', async () => {
  const lister = defaultConnectionLister('/proj/.dbcli', deps({
    readRawConfig: async () => ({ version: 2, default: 'prod', connections: {} }),
    detectVersion: () => 2,
    listV2: async () => [
      { name: 'prod', system: 'postgresql', isDefault: true },
      { name: 'staging', system: 'mysql', isDefault: false },
    ],
  }))
  expect(await lister()).toEqual([
    { name: 'prod', system: 'postgresql', isDefault: true },
    { name: 'staging', system: 'mysql', isDefault: false },
  ])
})

test('v1 config projects a single default connection from readConfig', async () => {
  const lister = defaultConnectionLister('/proj/.dbcli', deps({
    readRawConfig: async () => ({ version: 1, connection: { system: 'mysql' } }),
    detectVersion: () => 1,
    readV1: async () => ({ connection: { system: 'mysql' } }),
  }))
  expect(await lister()).toEqual([{ name: 'default', system: 'mysql', isDefault: true }])
})

test('missing config.json throws a ConfigError (→ NOT_CONFIGURED)', async () => {
  const lister = defaultConnectionLister('/proj/.dbcli', deps({
    readRawConfig: async () => undefined,
  }))
  await expect(lister()).rejects.toMatchObject({ name: 'ConfigError' })
})
