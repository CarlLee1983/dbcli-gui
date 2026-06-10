import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { WorkspaceSwitcher } from '../../src/views/WorkspaceSwitcher'
import type { Workspace } from '../../src/api/types'

afterEach(cleanup)

const G: Workspace = { id: 'global', label: '全域', kind: 'global', path: '~/.dbcli' }
const P: Workspace = { id: 'p1', label: 'proj', kind: 'project', path: '/proj/.dbcli' }

test('顯示 active workspace 的 label', () => {
  render(<WorkspaceSwitcher workspaces={[G, P]} activeId="p1" onSelect={() => {}} onAdd={async () => {}} onRemove={() => {}} />)
  expect(screen.getByText('proj')).toBeDefined()
})

test('點某 workspace 觸發 onSelect', () => {
  let picked = ''
  render(<WorkspaceSwitcher workspaces={[G, P]} activeId="global" onSelect={(id) => { picked = id }} onAdd={async () => {}} onRemove={() => {}} />)
  fireEvent.click(screen.getByText('全域')) // 展開
  fireEvent.click(screen.getByText('proj', { exact: false }))
  expect(picked).toBe('p1')
})
