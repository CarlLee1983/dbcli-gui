import { test, expect } from 'bun:test'
import { resolveSidecarConfig } from '../../sidecar/config'
import { toErrorBody } from '../../shared/errors'
import { OpenBody, QueryBody, SchemaTreeBody, SchemaTableBody, ExportBody } from '../../shared/schemas'
import { BlacklistError } from '@carllee1983/dbcli/core'

test('resolveSidecarConfig reads env with sane defaults', () => {
  const cfg = resolveSidecarConfig({ DBCLI_GUI_WORKDIR: '/tmp/proj', DBCLI_GUI_PORT: '0', DBCLI_GUI_TOKEN: 'tok' })
  expect(cfg.workdir).toBe('/tmp/proj')
  expect(cfg.dbcliPath).toBe('/tmp/proj/.dbcli')
  expect(cfg.port).toBe(0)
  expect(cfg.token).toBe('tok')
})

test('resolveSidecarConfig generates a token when none provided', () => {
  const cfg = resolveSidecarConfig({})
  expect(typeof cfg.token).toBe('string')
  expect(cfg.token.length).toBeGreaterThanOrEqual(16)
})

test('toErrorBody maps dbcli BlacklistError to a safe code', () => {
  const body = toErrorBody(new BlacklistError('users is protected', 'users', 'SELECT'))
  expect(body.error.code).toBe('BLACKLISTED')
  expect(typeof body.error.message).toBe('string')
})

test('toErrorBody falls back to INTERNAL for unknown errors', () => {
  expect(toErrorBody(new Error('boom')).error.code).toBe('INTERNAL')
})

test('QueryBody rejects missing sql', () => {
  expect(QueryBody.safeParse({ connectionId: 'c' }).success).toBe(false)
  expect(QueryBody.safeParse({ connectionId: 'c', sql: 'SELECT 1' }).success).toBe(true)
})

test('OpenBody requires connectionId', () => {
  expect(OpenBody.safeParse({}).success).toBe(false)
  expect(OpenBody.safeParse({ connectionId: 'main' }).success).toBe(true)
})

test('SchemaTreeBody requires connectionId', () => {
  expect(SchemaTreeBody.safeParse({}).success).toBe(false)
  expect(SchemaTreeBody.safeParse({ connectionId: 'main' }).success).toBe(true)
})

test('SchemaTableBody requires connectionId and table', () => {
  expect(SchemaTableBody.safeParse({ connectionId: 'main' }).success).toBe(false)
  expect(SchemaTableBody.safeParse({ connectionId: 'main', table: 'users' }).success).toBe(true)
})

test('ExportBody requires a valid format', () => {
  expect(ExportBody.safeParse({ connectionId: 'c', sql: 'SELECT 1' }).success).toBe(false)
  expect(ExportBody.safeParse({ connectionId: 'c', sql: 'SELECT 1', format: 'xml' }).success).toBe(false)
  expect(ExportBody.safeParse({ connectionId: 'c', sql: 'SELECT 1', format: 'csv' }).success).toBe(true)
  expect(ExportBody.safeParse({ connectionId: 'c', sql: 'SELECT 1', format: 'json' }).success).toBe(true)
})
