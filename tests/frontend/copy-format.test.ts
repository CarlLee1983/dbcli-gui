import { test, expect, describe } from 'bun:test'
import { cellText, rowToTsv, rowToCsv, sqlLiteral, rowToInsert } from '../../src/views/copy-format'

const row = { id: 1, name: 'a,b', note: null, active: true, meta: { k: 1 } }
const fields = ['id', 'name', 'note', 'active', 'meta']

describe('cellText', () => {
  test('null/undefined → empty string', () => {
    expect(cellText(null)).toBe('')
    expect(cellText(undefined)).toBe('')
  })
  test('objects render as JSON', () => {
    expect(cellText({ k: 1 })).toBe('{"k":1}')
  })
  test('primitives stringify', () => {
    expect(cellText(42)).toBe('42')
    expect(cellText('hi')).toBe('hi')
  })
})

describe('rowToTsv', () => {
  test('joins cell text with tabs in field order', () => {
    expect(rowToTsv(row, fields)).toBe('1\ta,b\t\ttrue\t{"k":1}')
  })
})

describe('rowToCsv', () => {
  test('quotes fields containing commas and escapes inner quotes', () => {
    expect(rowToCsv({ a: 'x,y', b: 'he said "hi"' }, ['a', 'b'])).toBe('"x,y","he said ""hi"""')
  })
  test('leaves plain fields unquoted', () => {
    expect(rowToCsv({ a: 'x', b: '1' }, ['a', 'b'])).toBe('x,1')
  })
})

describe('sqlLiteral', () => {
  test('null → NULL, number bare, boolean → TRUE/FALSE', () => {
    expect(sqlLiteral(null)).toBe('NULL')
    expect(sqlLiteral(7)).toBe('7')
    expect(sqlLiteral(true)).toBe('TRUE')
    expect(sqlLiteral(false)).toBe('FALSE')
  })
  test('strings are quoted with doubled single quotes', () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'")
  })
  test('objects are JSON-stringified then quoted', () => {
    expect(sqlLiteral({ k: 1 })).toBe('\'{"k":1}\'')
  })
})

describe('rowToInsert', () => {
  test('builds a full INSERT statement', () => {
    expect(rowToInsert('users', { id: 1, name: "O'B", admin: false }, ['id', 'name', 'admin']))
      .toBe("INSERT INTO users (id, name, admin) VALUES (1, 'O''B', FALSE);")
  })
})
