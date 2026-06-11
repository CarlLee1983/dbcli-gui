import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Editor } from '../../src/views/Editor'

afterEach(cleanup)

// The SQL text area is now a CodeMirror 6 instance (syntax highlight + autocomplete + line
// numbers). CodeMirror's own DOM/key handling can't be driven by happy-dom fireEvent, so
// typing + ⌘Enter behaviour is covered by the e2e journeys; here we test the surrounding chrome
// (Run / Export buttons) and that the editor mounts with the right a11y label.
function setup(over: Partial<React.ComponentProps<typeof Editor>> = {}) {
  const calls = { change: [] as string[], run: 0, export: [] as string[] }
  render(
    <Editor
      sql="SELECT 1"
      loading={false}
      hasResult={false}
      tables={['orders', 'users']}
      onChange={(s) => calls.change.push(s)}
      onRun={() => { calls.run++ }}
      onExport={(f) => calls.export.push(f)}
      {...over}
    />,
  )
  return calls
}

test('mounts a labelled SQL editor', () => {
  setup()
  expect(screen.getByLabelText('SQL 查詢')).toBeDefined()
})

test('Run button triggers onRun', () => {
  const calls = setup()
  fireEvent.click(screen.getByRole('button', { name: /Run/ }))
  expect(calls.run).toBe(1)
})

test('Run is disabled while loading', () => {
  setup({ loading: true })
  expect((screen.getByRole('button', { name: /Run/ }) as HTMLButtonElement).disabled).toBe(true)
})
