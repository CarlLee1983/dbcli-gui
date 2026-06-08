import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ExportButton } from '../../src/views/ExportButton'

afterEach(cleanup)

function setup(over: Partial<React.ComponentProps<typeof ExportButton>> = {}) {
  const calls: Array<'csv' | 'json'> = []
  render(<ExportButton hasResult={true} onExport={(f) => calls.push(f)} {...over} />)
  return calls
}

test('selecting CSV calls onExport with csv', () => {
  const calls = setup()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'csv' } })
  expect(calls).toEqual(['csv'])
})

test('selecting JSON calls onExport with json', () => {
  const calls = setup()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'json' } })
  expect(calls).toEqual(['json'])
})

test('is disabled when there is no result', () => {
  setup({ hasResult: false })
  expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
})
