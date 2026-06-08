import { test, expect, afterEach } from 'bun:test'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
import { ErrorBanner } from '../../src/components/ErrorBanner'
import { ApiError } from '../../src/api/client'

test('maps BLACKLISTED to a friendly message', () => {
  render(<ErrorBanner error={new ApiError('BLACKLISTED', 'raw', 403)} onDismiss={() => {}} />)
  expect(screen.getByText('此表受保護，無法存取')).toBeDefined()
})

test('falls back to a generic message for unknown codes', () => {
  render(<ErrorBanner error={new ApiError('WEIRD', 'raw', 500)} onDismiss={() => {}} />)
  expect(screen.getByText('發生未預期錯誤')).toBeDefined()
})

test('renders nothing when error is null', () => {
  const { container } = render(<ErrorBanner error={null} onDismiss={() => {}} />)
  expect(container.textContent).toBe('')
})

test('dismiss button fires onDismiss', () => {
  let dismissed = false
  render(<ErrorBanner error={new ApiError('CONNECTION', 'raw', 502)} onDismiss={() => { dismissed = true }} />)
  fireEvent.click(screen.getByRole('button', { name: /關閉/ }))
  expect(dismissed).toBe(true)
})
