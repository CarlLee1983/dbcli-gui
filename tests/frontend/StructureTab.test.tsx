import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { StructureTab } from '../../src/views/table/StructureTab'
import type { TableSchemaDto } from '../../src/api/types'

afterEach(cleanup)

function schema(over: Partial<TableSchemaDto> = {}): TableSchemaDto {
  return {
    name: 'orders',
    columns: [
      { name: 'id', type: 'int', nullable: false, primaryKey: true, comment: '訂單主鍵' },
      { name: 'label', type: 'varchar(50)', nullable: false },
    ],
    primaryKey: ['id'],
    ...over,
  }
}

test('renders a 說明 (comment) header column', () => {
  render(<StructureTab schema={schema()} />)
  expect(screen.getByRole('columnheader', { name: '說明' })).toBeDefined()
})

test('shows the column comment text when present', () => {
  render(<StructureTab schema={schema()} />)
  expect(screen.getByText('訂單主鍵')).toBeDefined()
})

test('renders columns without a comment without crashing', () => {
  render(<StructureTab schema={schema()} />)
  // the comment-less "label" row still renders its name
  expect(screen.getByText('label')).toBeDefined()
})
