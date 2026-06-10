import { test, expect, describe } from 'bun:test'
import { detectSingleTable, resultIsEditable } from '../../src/hooks/single-table'

describe('detectSingleTable', () => {
  test('plain SELECT * returns the table name', () => {
    expect(detectSingleTable('SELECT * FROM users')).toBe('users')
  })

  test('is case-insensitive on keywords', () => {
    expect(detectSingleTable('select * from users')).toBe('users')
  })

  test('explicit columns + WHERE returns the table name', () => {
    expect(detectSingleTable('SELECT id, name FROM users WHERE id = 1')).toBe('users')
  })

  test('ORDER BY / LIMIT clauses are allowed', () => {
    expect(detectSingleTable('SELECT * FROM users ORDER BY id DESC LIMIT 10')).toBe('users')
  })

  test('OFFSET clause is allowed', () => {
    expect(detectSingleTable('SELECT * FROM users LIMIT 10 OFFSET 5')).toBe('users')
  })

  test('schema-qualified table is preserved', () => {
    expect(detectSingleTable('SELECT * FROM public.orders')).toBe('public.orders')
  })

  test('extra whitespace and newlines are tolerated', () => {
    expect(detectSingleTable('SELECT *\n  FROM   users\n')).toBe('users')
  })

  test('trailing semicolon is stripped', () => {
    expect(detectSingleTable('SELECT * FROM users;')).toBe('users')
  })

  test('a comma inside WHERE does not break detection', () => {
    expect(detectSingleTable('SELECT * FROM users WHERE id IN (1, 2, 3)')).toBe('users')
  })

  test('backtick-quoted identifier is unwrapped', () => {
    expect(detectSingleTable('SELECT * FROM `users`')).toBe('users')
  })

  // --- rejections (return null) ---

  test('INNER JOIN is rejected', () => {
    expect(detectSingleTable('SELECT * FROM a JOIN b ON a.id = b.id')).toBeNull()
  })

  test('LEFT JOIN is rejected', () => {
    expect(detectSingleTable('SELECT * FROM a LEFT JOIN b ON a.id = b.id')).toBeNull()
  })

  test('comma join (multiple tables) is rejected', () => {
    expect(detectSingleTable('SELECT * FROM a, b')).toBeNull()
  })

  test('subquery in FROM is rejected', () => {
    expect(detectSingleTable('SELECT * FROM (SELECT * FROM users) t')).toBeNull()
  })

  test('table alias is rejected (conservative)', () => {
    expect(detectSingleTable('SELECT * FROM users u')).toBeNull()
  })

  test('AS table alias is rejected', () => {
    expect(detectSingleTable('SELECT * FROM users AS u')).toBeNull()
  })

  test('UNION is rejected', () => {
    expect(detectSingleTable('SELECT * FROM a UNION SELECT * FROM b')).toBeNull()
  })

  test('DISTINCT is rejected', () => {
    expect(detectSingleTable('SELECT DISTINCT id FROM users')).toBeNull()
  })

  test('GROUP BY is rejected', () => {
    expect(detectSingleTable('SELECT id FROM users GROUP BY id')).toBeNull()
  })

  test('HAVING is rejected', () => {
    expect(detectSingleTable('SELECT id FROM users GROUP BY id HAVING COUNT(*) > 1')).toBeNull()
  })

  test('CTE (WITH) is rejected', () => {
    expect(detectSingleTable('WITH t AS (SELECT 1) SELECT * FROM t')).toBeNull()
  })

  test('scalar subquery in the select list is rejected (two FROMs)', () => {
    expect(detectSingleTable('SELECT (SELECT max(a) FROM b) FROM c')).toBeNull()
  })

  test('non-SELECT statements are rejected', () => {
    expect(detectSingleTable('UPDATE users SET name = 1')).toBeNull()
    expect(detectSingleTable('DELETE FROM users')).toBeNull()
    expect(detectSingleTable('INSERT INTO users VALUES (1)')).toBeNull()
  })

  test('SELECT without FROM is rejected', () => {
    expect(detectSingleTable('SELECT 1')).toBeNull()
  })

  test('empty / whitespace input is rejected', () => {
    expect(detectSingleTable('')).toBeNull()
    expect(detectSingleTable('   ')).toBeNull()
  })

  // The detector does not strip string literals or comments. Such SQL is conservatively
  // rejected (fail closed → stays read-only) rather than risk a wrong-table edit. These
  // pin that intended behavior; a false POSITIVE here would be the dangerous direction.
  test('a string literal containing "from" is conservatively rejected', () => {
    expect(detectSingleTable("SELECT * FROM users WHERE note = 'see from log'")).toBeNull()
  })

  test('a comment containing an unsafe keyword is conservatively rejected', () => {
    expect(detectSingleTable('SELECT * FROM users -- join')).toBeNull()
  })
})

describe('resultIsEditable', () => {
  const schema = (primaryKey?: string[]) => ({ name: 'users', columns: [], primaryKey })

  test('true when single PK is present in result fields', () => {
    expect(resultIsEditable(schema(['id']), ['id', 'name'])).toBe(true)
  })

  test('true when all composite PK columns are present', () => {
    expect(resultIsEditable(schema(['a', 'b']), ['a', 'b', 'c'])).toBe(true)
  })

  test('false when a PK column is missing from fields', () => {
    expect(resultIsEditable(schema(['id']), ['name', 'email'])).toBe(false)
  })

  test('false when one of a composite PK is missing', () => {
    expect(resultIsEditable(schema(['a', 'b']), ['a', 'c'])).toBe(false)
  })

  test('false when schema has no primary key', () => {
    expect(resultIsEditable(schema(undefined), ['id'])).toBe(false)
    expect(resultIsEditable(schema([]), ['id'])).toBe(false)
  })
})
