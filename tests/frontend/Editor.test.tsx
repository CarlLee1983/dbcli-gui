import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Editor } from '../../src/views/Editor'

afterEach(cleanup)

function setup(over: Partial<React.ComponentProps<typeof Editor>> = {}) {
  const calls = { change: [] as string[], run: 0, export: [] as string[] }
  render(
    <Editor
      sql="SELECT 1"
      loading={false}
      hasResult={false}
      onChange={(s) => calls.change.push(s)}
      onRun={() => { calls.run++ }}
      onExport={(f) => calls.export.push(f)}
      {...over}
    />,
  )
  return calls
}

test('typing updates sql via onChange', () => {
  const calls = setup()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'SELECT 2' } })
  expect(calls.change).toEqual(['SELECT 2'])
})

test('Run button triggers onRun', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: /Run/ }))
  expect(calls.run).toBe(1)
})

test('Cmd/Ctrl+Enter triggers onRun', () => {
  const calls = setup()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true })
  expect(calls.run).toBe(1)
})

test('Ctrl+Enter also triggers onRun', () => {
  const calls = setup()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
  expect(calls.run).toBe(1)
})

test('Cmd/Ctrl+Enter does not trigger onRun while loading', () => {
  const calls = setup({ loading: true })
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true })
  expect(calls.run).toBe(0)
})

test('plain Enter does not trigger onRun', () => {
  const calls = setup()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(calls.run).toBe(0)
})

test('Run is disabled while loading', () => {
  setup({ loading: true })
  expect((screen.getByRole('button', { name: /Run/ }) as HTMLButtonElement).disabled).toBe(true)
})
