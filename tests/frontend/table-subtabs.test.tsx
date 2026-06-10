import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { StructureTab } from '../../src/views/table/StructureTab'
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
