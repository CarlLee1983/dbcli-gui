import { test, expect } from 'bun:test'
import { toErrorBody, statusForCode } from '../../shared/errors'
import { BlacklistError, ConnectionError } from '@carllee1983/dbcli/core'

test('toErrorBody maps a ConfigError (matched by name) to NOT_CONFIGURED', () => {
  // dbcli throws ConfigError for a missing/invalid .dbcli config or unknown connection.
  // It is not exported as a class, so toErrorBody matches it by name (like PermissionError).
  const err = new Error('找不到 V2 設定檔：/proj/.dbcli/config.json')
  err.name = 'ConfigError'
  expect(toErrorBody(err)).toEqual({ error: { code: 'NOT_CONFIGURED', message: err.message } })
})

test('toErrorBody maps a PermissionError (by name) to PERMISSION', () => {
  const err = new Error('read-only')
  err.name = 'PermissionError'
  expect(toErrorBody(err)).toEqual({ error: { code: 'PERMISSION', message: 'read-only' } })
})

test('toErrorBody maps typed dbcli errors', () => {
  expect(toErrorBody(new BlacklistError('x', 't', 'schema')).error.code).toBe('BLACKLISTED')
  expect(toErrorBody(new ConnectionError('ECONNREFUSED', 'down', [])).error.code).toBe('CONNECTION')
})

test('toErrorBody collapses an unknown Error to INTERNAL', () => {
  expect(toErrorBody(new Error('boom'))).toEqual({ error: { code: 'INTERNAL', message: 'boom' } })
  expect(toErrorBody('not an error')).toEqual({ error: { code: 'INTERNAL', message: 'Unknown error' } })
})

test('statusForCode maps every user-safe code to an HTTP status', () => {
  expect(statusForCode('BAD_REQUEST')).toBe(400)
  expect(statusForCode('PERMISSION')).toBe(403)
  expect(statusForCode('BLACKLISTED')).toBe(403)
  expect(statusForCode('NOT_OPEN')).toBe(409)
  expect(statusForCode('NOT_CONFIGURED')).toBe(501)
  expect(statusForCode('CONNECTION')).toBe(502)
  expect(statusForCode('INTERNAL')).toBe(500)
})

test('statusForCode falls back to 500 for unknown codes', () => {
  expect(statusForCode('SOMETHING_NEW')).toBe(500)
})
