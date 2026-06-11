import { test, expect } from 'bun:test'
import { buildSqlSchema } from '../../src/views/sql-schema'

test('maps every table to an (empty) column list so table names complete', () => {
  expect(buildSqlSchema(['orders', 'users'])).toEqual({ orders: [], users: [] })
})

test('attaches known columns per table', () => {
  expect(buildSqlSchema(['orders'], { orders: ['id', 'label'] })).toEqual({ orders: ['id', 'label'] })
})

test('falls back to an empty list for tables without known columns', () => {
  expect(buildSqlSchema(['orders', 'users'], { orders: ['id'] })).toEqual({ orders: ['id'], users: [] })
})

test('no tables → empty schema', () => {
  expect(buildSqlSchema([])).toEqual({})
})
