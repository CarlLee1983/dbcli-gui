import { test, expect } from 'bun:test'
import { ConnectionInputBody, ConnectionNameBody, TestConnectionBody } from '../../shared/schemas'
import { statusForCode } from '../../shared/errors'

test('CONFLICT / NOT_FOUND map to 409 / 404', () => {
  expect(statusForCode('CONFLICT')).toBe(409)
  expect(statusForCode('NOT_FOUND')).toBe(404)
})

test('ConnectionInputBody accepts a full SQL connection, password optional', () => {
  const ok = ConnectionInputBody.safeParse({
    name: 'staging', system: 'postgresql', host: 'h', port: 5432, user: 'u', database: 'd', password: 'p',
  })
  expect(ok.success).toBe(true)
  const noPw = ConnectionInputBody.safeParse({
    name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd',
  })
  expect(noPw.success).toBe(true)
})

test('ConnectionInputBody rejects non-SQL system and bad port', () => {
  expect(ConnectionInputBody.safeParse({ name: 'x', system: 'redis', host: 'h', port: 1, user: 'u', database: 'd' }).success).toBe(false)
  expect(ConnectionInputBody.safeParse({ name: 'x', system: 'mysql', host: 'h', port: 0, user: 'u', database: 'd' }).success).toBe(false)
})

test('ConnectionNameBody / TestConnectionBody', () => {
  expect(ConnectionNameBody.safeParse({ name: 'a' }).success).toBe(true)
  expect(TestConnectionBody.safeParse({ system: 'mariadb', host: 'h', port: 3306, user: 'u', database: 'd', password: 'p' }).success).toBe(true)
})
