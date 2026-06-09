import { test, expect, afterEach, mock } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CellDetailModal } from '../../src/components/CellDetailModal'

afterEach(cleanup)

function setup(over: Partial<React.ComponentProps<typeof CellDetailModal>> = {}) {
  const onClose = mock(() => {})
  const writeText = mock(async () => {})
  // @ts-expect-error happy-dom navigator has no clipboard by default
  globalThis.navigator.clipboard = { writeText }
  render(
    <CellDetailModal field="label" value="orders-row-1" row={{ id: 1, label: 'orders-row-1' }} onClose={onClose} {...over} />,
  )
  return { onClose, writeText }
}

test('shows the field name and value', () => {
  setup()
  expect(screen.getByText('label')).toBeDefined()
  expect(screen.getByText('orders-row-1')).toBeDefined()
})

test('object value is pretty-printed as JSON', () => {
  setup({ value: { tag: 'fruit' } })
  expect(screen.getByText(/"tag": "fruit"/)).toBeDefined()
})

test('null value renders as NULL', () => {
  setup({ value: null })
  expect(screen.getByText('NULL')).toBeDefined()
})

test('複製值 button copies the formatted value', () => {
  const { writeText } = setup({ value: { tag: 'fruit' } })
  fireEvent.click(screen.getByRole('button', { name: '複製值' }))
  expect(writeText).toHaveBeenCalledWith('{\n  "tag": "fruit"\n}')
})

test('複製整列 button copies the row as JSON', () => {
  const { writeText } = setup()
  fireEvent.click(screen.getByRole('button', { name: '複製整列' }))
  expect(writeText).toHaveBeenCalledWith('{"id":1,"label":"orders-row-1"}')
})

test('Escape key closes the modal', () => {
  const { onClose } = setup()
  const event = new KeyboardEvent('keydown', { key: 'Escape' })
  document.dispatchEvent(event)
  expect(onClose).toHaveBeenCalled()
})

test('clicking the close button closes the modal', () => {
  const { onClose } = setup()
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  expect(onClose).toHaveBeenCalled()
})
