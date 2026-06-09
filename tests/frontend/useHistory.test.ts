import { test, expect, beforeEach } from 'bun:test'
import { renderHook, act } from '@testing-library/react'
import { useHistory, addHistoryEntry, loadHistory, relativeTime, type HistoryEntry } from '../../src/hooks/useHistory'

const entry = (sql: string, ts = 1000): HistoryEntry => ({ sql, connectionId: 'main', ts, rowCount: 1 })

beforeEach(() => { localStorage.clear() })

test('addHistoryEntry prepends and dedupes by sql+connectionId', () => {
  const a = addHistoryEntry([], entry('SELECT 1'))
  const b = addHistoryEntry(a, entry('SELECT 2'))
  const c = addHistoryEntry(b, entry('SELECT 1', 2000)) // duplicate sql, moves to top with new ts
  expect(c.map((e) => e.sql)).toEqual(['SELECT 1', 'SELECT 2'])
  expect(c[0]!.ts).toBe(2000)
})

test('addHistoryEntry caps at 100 entries', () => {
  let list: HistoryEntry[] = []
  for (let i = 0; i < 120; i++) list = addHistoryEntry(list, entry(`SELECT ${i}`))
  expect(list.length).toBe(100)
  expect(list[0]!.sql).toBe('SELECT 119')
})

test('loadHistory returns [] on missing or corrupt storage', () => {
  expect(loadHistory()).toEqual([])
  localStorage.setItem('dbcli-gui:history', '{not json')
  expect(loadHistory()).toEqual([])
})

test('relativeTime formats seconds/minutes/hours ago', () => {
  const now = 1_000_000
  expect(relativeTime(now - 5_000, now)).toBe('5 秒前')
  expect(relativeTime(now - 120_000, now)).toBe('2 分前')
  expect(relativeTime(now - 7_200_000, now)).toBe('2 小時前')
})

test('useHistory.add persists to localStorage', () => {
  const { result } = renderHook(() => useHistory())
  act(() => { result.current.add(entry('SELECT 9')) })
  expect(result.current.entries[0]!.sql).toBe('SELECT 9')
  expect(JSON.parse(localStorage.getItem('dbcli-gui:history')!)[0]!.sql).toBe('SELECT 9')
})

test('useHistory.clear empties entries and storage', () => {
  const { result } = renderHook(() => useHistory())
  act(() => { result.current.add(entry('SELECT 9')) })
  act(() => { result.current.clear() })
  expect(result.current.entries).toEqual([])
  expect(localStorage.getItem('dbcli-gui:history')).toBeNull()
})
