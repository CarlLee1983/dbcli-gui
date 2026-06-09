import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ConnectionFormModal } from '../../src/components/ConnectionFormModal'
import type { ConnectionFormInput } from '../../src/api/types'

afterEach(cleanup)

const noop = async () => ({ ok: true, ms: 1 })

test('create mode: fills form and submits ConnectionFormInput', async () => {
  const onSubmit = mock(async (_input: ConnectionFormInput) => {})
  render(<ConnectionFormModal mode="create" onSubmit={onSubmit} onTest={noop} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('連線名稱'), { target: { value: 'staging' } })
  fireEvent.change(screen.getByLabelText('主機'), { target: { value: 'db.stg' } })
  fireEvent.change(screen.getByLabelText('連接埠'), { target: { value: '5432' } })
  fireEvent.change(screen.getByLabelText('使用者'), { target: { value: 'app' } })
  fireEvent.change(screen.getByLabelText('資料庫'), { target: { value: 'app' } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'p' } })
  fireEvent.click(screen.getByRole('button', { name: '儲存' }))
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  expect(onSubmit.mock.calls[0]![0]).toMatchObject({ name: 'staging', host: 'db.stg', port: 5432, user: 'app', database: 'app', password: 'p' })
})

test('edit mode: name is read-only and password placeholder says blank=unchanged', () => {
  render(<ConnectionFormModal mode="edit"
    initial={{ name: 'primary', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' }}
    onSubmit={async () => {}} onTest={noop} onClose={() => {}} />)
  expect((screen.getByLabelText('連線名稱') as HTMLInputElement).disabled).toBe(true)
  expect(screen.getByLabelText('密碼').getAttribute('placeholder') ?? '').toContain('留白')
})

test('測試連線 shows the result', async () => {
  render(<ConnectionFormModal mode="create" onSubmit={async () => {}} onTest={async () => ({ ok: true, ms: 7 })} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('主機'), { target: { value: 'h' } })
  fireEvent.change(screen.getByLabelText('連接埠'), { target: { value: '3306' } })
  fireEvent.change(screen.getByLabelText('使用者'), { target: { value: 'u' } })
  fireEvent.change(screen.getByLabelText('資料庫'), { target: { value: 'd' } })
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  await waitFor(() => expect(screen.getByText(/成功/)).toBeTruthy())
})

test('測試連線 shows the failure message when onTest throws', async () => {
  render(<ConnectionFormModal mode="create" onSubmit={async () => {}}
    onTest={async () => { throw new Error('連線被拒') }} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('主機'), { target: { value: 'h' } })
  fireEvent.change(screen.getByLabelText('連接埠'), { target: { value: '3306' } })
  fireEvent.change(screen.getByLabelText('使用者'), { target: { value: 'u' } })
  fireEvent.change(screen.getByLabelText('資料庫'), { target: { value: 'd' } })
  fireEvent.click(screen.getByRole('button', { name: '測試連線' }))
  await waitFor(() => expect(screen.getByText(/連線被拒/)).toBeTruthy())
})
