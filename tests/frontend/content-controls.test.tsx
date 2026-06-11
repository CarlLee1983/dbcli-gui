import { test, expect, afterEach, describe } from 'bun:test'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { ContentFilterBar } from '../../src/views/ContentFilterBar'
import { ContentPager } from '../../src/views/ContentPager'

afterEach(cleanup)

const columns = [{ name: 'id' }, { name: 'email' }, { name: 'name' }]

describe('ContentFilterBar', () => {
  function setup(over: Partial<React.ComponentProps<typeof ContentFilterBar>> = {}) {
    const applied: Array<unknown> = []
    const utils = render(<ContentFilterBar columns={columns} filter={null} onApply={(f) => applied.push(f)} {...over} />)
    return { ...utils, applied }
  }

  test('applies a filter from the chosen column / operator / value', () => {
    const { getByLabelText, getByRole, applied } = setup()
    fireEvent.change(getByLabelText('篩選欄位'), { target: { value: 'email' } })
    fireEvent.change(getByLabelText('篩選運算子'), { target: { value: 'contains' } })
    fireEvent.change(getByLabelText('篩選值'), { target: { value: 'gmail' } })
    fireEvent.click(getByRole('button', { name: '篩選' }))
    expect(applied).toEqual([{ column: 'email', op: 'contains', value: 'gmail' }])
  })

  test('Enter in the value input applies the filter', () => {
    const { getByLabelText, applied } = setup()
    fireEvent.change(getByLabelText('篩選值'), { target: { value: 'x' } })
    fireEvent.keyDown(getByLabelText('篩選值'), { key: 'Enter' })
    expect(applied.length).toBe(1)
  })

  test('the value input is disabled for a unary operator (IS NULL)', () => {
    const { getByLabelText } = setup()
    fireEvent.change(getByLabelText('篩選運算子'), { target: { value: 'IS NULL' } })
    expect((getByLabelText('篩選值') as HTMLInputElement).disabled).toBe(true)
  })

  test('shows a clear button only when a filter is active; clearing applies null', () => {
    const { queryByLabelText } = setup()
    expect(queryByLabelText('清除篩選')).toBeNull()
    cleanup()
    const { getByLabelText, applied } = setup({ filter: { column: 'email', op: '=', value: 'a' } })
    fireEvent.click(getByLabelText('清除篩選'))
    expect(applied).toEqual([null])
  })
})

describe('ContentPager', () => {
  function setup(over: Partial<React.ComponentProps<typeof ContentPager>> = {}) {
    const pages: number[] = []
    const utils = render(<ContentPager page={0} pageSize={200} rowCount={200} total={3482} onPage={(p) => pages.push(p)} {...over} />)
    return { ...utils, pages }
  }

  test('shows the row range and a thousands-formatted total', () => {
    const { getByText } = setup()
    expect(getByText(/1–200/)).toBeDefined()
    expect(getByText(/3,482/)).toBeDefined()
  })

  test('prev is disabled on the first page', () => {
    const { getByLabelText } = setup()
    expect((getByLabelText('上一頁') as HTMLButtonElement).disabled).toBe(true)
  })

  test('next advances the page', () => {
    const { getByLabelText, pages } = setup()
    fireEvent.click(getByLabelText('下一頁'))
    expect(pages).toEqual([1])
  })

  test('range reflects the current page offset', () => {
    const { getByText } = setup({ page: 2, rowCount: 200 })
    expect(getByText(/401–600/)).toBeDefined()
  })

  test('next is disabled on the last page (by total)', () => {
    const { getByLabelText } = setup({ page: 17, rowCount: 82, total: 3482 })
    // 17*200 = 3400; 3400+82 = 3482 = total → no next page
    expect((getByLabelText('下一頁') as HTMLButtonElement).disabled).toBe(true)
  })

  test('with unknown total, next is disabled when the page is not full', () => {
    const { getByLabelText } = setup({ total: null, rowCount: 150 })
    expect((getByLabelText('下一頁') as HTMLButtonElement).disabled).toBe(true)
  })
})
