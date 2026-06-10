import { test, expect } from 'bun:test'
import { tableDialectFor } from '../../sidecar/dialect'

test('mysql triggers query uses ? placeholder + DATABASE() scope', () => {
  const q = tableDialectFor('mysql').triggers('orders')
  expect(q.params).toEqual(['orders'])
  expect(q.sql).toContain('information_schema.TRIGGERS')
  expect(q.sql).toContain('EVENT_OBJECT_TABLE = ?')
  expect(q.sql).toContain('TRIGGER_SCHEMA = DATABASE()')
})

test('mariadb shares the mysql dialect', () => {
  expect(tableDialectFor('mariadb').triggers('t')).toEqual(tableDialectFor('mysql').triggers('t'))
})

test('postgresql triggers query uses $1 placeholder', () => {
  const q = tableDialectFor('postgresql').triggers('orders')
  expect(q.params).toEqual(['orders'])
  expect(q.sql).toContain('information_schema.triggers')
  expect(q.sql).toContain('event_object_table = $1')
})

test('mysql reverseRelations keys on REFERENCED_TABLE_NAME', () => {
  const q = tableDialectFor('mysql').reverseRelations('users')
  expect(q.params).toEqual(['users'])
  expect(q.sql).toContain('information_schema.KEY_COLUMN_USAGE')
  expect(q.sql).toContain('REFERENCED_TABLE_NAME = ?')
})

test('postgresql reverseRelations uses $1 and pg catalog/info_schema', () => {
  const q = tableDialectFor('postgresql').reverseRelations('users')
  expect(q.params).toEqual(['users'])
  expect(q.sql).toContain('$1')
})

test('mysql info query reads engine/rows/size/collation/create_time', () => {
  const q = tableDialectFor('mysql').info('orders')
  expect(q.params).toEqual(['orders'])
  expect(q.sql).toContain('information_schema.TABLES')
  expect(q.sql).toContain('TABLE_SCHEMA = DATABASE()')
  expect(q.sql).toContain('TABLE_NAME = ?')
})

test('mysql createTable returns a backtick-escaped SHOW CREATE TABLE, no params', () => {
  const q = tableDialectFor('mysql').createTable('we`ird')
  expect(q).not.toBeNull()
  expect(q!.sql).toBe('SHOW CREATE TABLE `we``ird`')
  expect(q!.params).toEqual([])
})

test('postgresql createTable returns null (no CREATE TABLE source)', () => {
  expect(tableDialectFor('postgresql').createTable('orders')).toBeNull()
})

test('unsupported system throws', () => {
  expect(() => tableDialectFor('mongodb')).toThrow()
})
