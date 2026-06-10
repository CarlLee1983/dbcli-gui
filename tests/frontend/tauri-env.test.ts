import { test, expect, afterEach } from 'bun:test'
import { inTauri } from '../../src/api/tauri-env'

const g = globalThis as Record<string, unknown>

afterEach(() => {
  delete g.__TAURI_INTERNALS__
  delete g.__DBCLI__
  delete g.__TAURI__
})

test('瀏覽器環境(無任何 Tauri 標記)回傳 false', () => {
  expect(inTauri()).toBe(false)
})

test('__TAURI_INTERNALS__ 存在時回傳 true(Tauri webview 一定有)', () => {
  g.__TAURI_INTERNALS__ = {}
  expect(inTauri()).toBe(true)
})

test('__DBCLI__ 存在時回傳 true(app shell 注入)', () => {
  g.__DBCLI__ = {}
  expect(inTauri()).toBe(true)
})

test('僅有 __TAURI__ 不足以判定(v2 預設不注入,不可依賴)', () => {
  g.__TAURI__ = {}
  expect(inTauri()).toBe(false)
})
