import { test, expect, describe } from 'bun:test'
import { buildWhere, buildBrowseSql, buildCountSql, parseTotal, DEFAULT_PAGE_SIZE, type ContentFilter } from '../../src/views/content-query'

const f = (over: Partial<ContentFilter> = {}): ContentFilter => ({ column: 'email', op: '=', value: 'a@b.com', ...over })

describe('buildWhere', () => {
  test('no filter → empty string', () => {
    expect(buildWhere(null)).toBe('')
  })

  test('empty value on a value-bearing op → empty string (inactive)', () => {
    expect(buildWhere(f({ value: '' }))).toBe('')
    expect(buildWhere(f({ value: '   ' }))).toBe('')
  })

  test('equality quotes the value', () => {
    expect(buildWhere(f({ op: '=', value: 'carl' }))).toBe("WHERE email = 'carl'")
  })

  test('comparison operators pass through', () => {
    expect(buildWhere(f({ column: 'age', op: '>', value: '18' }))).toBe("WHERE age > '18'")
    expect(buildWhere(f({ column: 'age', op: '<=', value: '5' }))).toBe("WHERE age <= '5'")
    expect(buildWhere(f({ column: 'age', op: '!=', value: '0' }))).toBe("WHERE age != '0'")
  })

  test('contains / starts / ends wrap with LIKE wildcards', () => {
    expect(buildWhere(f({ op: 'contains', value: 'gmail' }))).toBe("WHERE email LIKE '%gmail%'")
    expect(buildWhere(f({ op: 'starts', value: 'carl' }))).toBe("WHERE email LIKE 'carl%'")
    expect(buildWhere(f({ op: 'ends', value: '.com' }))).toBe("WHERE email LIKE '%.com'")
  })

  test('raw LIKE passes the value verbatim', () => {
    expect(buildWhere(f({ op: 'LIKE', value: '%a_b%' }))).toBe("WHERE email LIKE '%a_b%'")
  })

  test('unary operators need no value', () => {
    expect(buildWhere(f({ op: 'IS NULL', value: '' }))).toBe('WHERE email IS NULL')
    expect(buildWhere(f({ op: 'IS NOT NULL', value: '' }))).toBe('WHERE email IS NOT NULL')
  })

  test('single quotes in the value are escaped (SQL-standard doubling)', () => {
    expect(buildWhere(f({ op: '=', value: "O'Brien" }))).toBe("WHERE email = 'O''Brien'")
    expect(buildWhere(f({ op: 'contains', value: "a'b" }))).toBe("WHERE email LIKE '%a''b%'")
  })
})

describe('buildBrowseSql', () => {
  test('plain browse matches the legacy default (no OFFSET at page 0)', () => {
    expect(buildBrowseSql('users')).toBe('SELECT * FROM users LIMIT 200')
  })

  test('sort adds ORDER BY', () => {
    expect(buildBrowseSql('orders', { sortField: 'id', sortDir: 'asc' })).toBe('SELECT * FROM orders ORDER BY id ASC LIMIT 200')
    expect(buildBrowseSql('orders', { sortField: 'id', sortDir: 'desc' })).toBe('SELECT * FROM orders ORDER BY id DESC LIMIT 200')
  })

  test('page > 0 adds OFFSET = page * pageSize', () => {
    expect(buildBrowseSql('users', { page: 1 })).toBe('SELECT * FROM users LIMIT 200 OFFSET 200')
    expect(buildBrowseSql('users', { page: 3 })).toBe('SELECT * FROM users LIMIT 200 OFFSET 600')
  })

  test('filter injects WHERE before ORDER BY and LIMIT', () => {
    expect(buildBrowseSql('users', { filter: f({ op: 'contains', value: 'gmail' }), sortField: 'id', sortDir: 'asc', page: 1 }))
      .toBe("SELECT * FROM users WHERE email LIKE '%gmail%' ORDER BY id ASC LIMIT 200 OFFSET 200")
  })

  test('DEFAULT_PAGE_SIZE is 200', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(200)
  })
})

describe('buildCountSql', () => {
  test('counts the whole table when no filter', () => {
    expect(buildCountSql('users', null)).toBe('SELECT COUNT(*) AS total FROM users')
  })

  test('applies the active filter', () => {
    expect(buildCountSql('users', f({ op: 'contains', value: 'gmail' }))).toBe("SELECT COUNT(*) AS total FROM users WHERE email LIKE '%gmail%'")
  })
})

describe('parseTotal', () => {
  test('reads the total column as a number', () => {
    expect(parseTotal({ rows: [{ total: 3482 }], fields: ['total'], rowCount: 1, ms: 1 })).toBe(3482)
  })

  test('coerces a bigint string (Postgres COUNT returns text)', () => {
    expect(parseTotal({ rows: [{ total: '3482' }], fields: ['total'], rowCount: 1, ms: 1 })).toBe(3482)
  })

  test('returns null when the count is missing or unparseable', () => {
    expect(parseTotal({ rows: [], fields: ['total'], rowCount: 0, ms: 1 })).toBeNull()
    expect(parseTotal({ rows: [{ total: 'NaN' }], fields: ['total'], rowCount: 1, ms: 1 })).toBeNull()
  })
})
