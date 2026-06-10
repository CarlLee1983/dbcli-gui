import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { StructureTab } from '../../src/views/table/StructureTab'
import { TriggersTab } from '../../src/views/table/TriggersTab'
import { InfoTab } from '../../src/views/table/InfoTab'
import { RelationsTab } from '../../src/views/table/RelationsTab'
import type { TableSchemaDto } from '../../src/api/types'

afterEach(cleanup)

const schema: TableSchemaDto = {
  name: 'users',
  columns: [
    { name: 'id', type: 'int', nullable: false, primaryKey: true },
    { name: 'email', type: 'text', nullable: true },
  ],
  primaryKey: ['id'],
  indexes: [{ name: 'idx_email', columns: ['email'], unique: true }],
}

test('StructureTab renders columns with type/null/PK', () => {
  render(<StructureTab schema={schema} />)
  expect(screen.getByText('id')).toBeDefined()
  expect(screen.getByText('email')).toBeDefined()
  expect(screen.getByText('idx_email')).toBeDefined()
})

test('StructureTab shows empty state for no columns', () => {
  render(<StructureTab schema={{ name: 'x', columns: [] }} />)
  expect(screen.getByText(/無欄位/)).toBeDefined()
})

const err = { code: 'PERMISSION', message: '受保護', status: 403 }

test('TriggersTab: loading / list / empty / error', () => {
  const { rerender } = render(<TriggersTab triggers={undefined} error={undefined} />)
  expect(screen.getByText(/載入中/)).toBeDefined()
  rerender(<TriggersTab triggers={[{ name: 'trg', timing: 'AFTER', event: 'INSERT', statement: 'X' }]} error={undefined} />)
  expect(screen.getByText('trg')).toBeDefined()
  rerender(<TriggersTab triggers={[]} error={undefined} />)
  expect(screen.getByText(/沒有觸發器/)).toBeDefined()
  rerender(<TriggersTab triggers={undefined} error={err} />)
  expect(screen.getByText(/受保護/)).toBeDefined()
})

test('InfoTab: renders metrics + CREATE block + null create note', () => {
  const { rerender } = render(<InfoTab info={{ engine: 'InnoDB', rowCount: 42, sizeBytes: 16384, collation: 'utf8mb4', createdAt: '2024', createSql: 'CREATE TABLE x' }} error={undefined} />)
  expect(screen.getByText('InnoDB')).toBeDefined()
  expect(screen.getByText(/CREATE TABLE x/)).toBeDefined()
  rerender(<InfoTab info={{ engine: null, rowCount: null, sizeBytes: null, collation: null, createdAt: null, createSql: null }} error={undefined} />)
  expect(screen.getByText(/不提供 CREATE/)).toBeDefined()
})

test('RelationsTab: forward + reverse + both-empty state', () => {
  const { rerender } = render(<RelationsTab relations={{ forward: [{ fromTable: 'o', fromColumn: 'uid', toTable: 'users', toColumn: 'id' }], reverse: [] }} error={undefined} />)
  expect(screen.getByText(/uid/)).toBeDefined()
  rerender(<RelationsTab relations={{ forward: [], reverse: [] }} error={undefined} />)
  expect(screen.getByText(/沒有關聯/)).toBeDefined()
})
