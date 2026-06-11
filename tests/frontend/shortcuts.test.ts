import { test, expect, describe } from 'bun:test'
import { resolveShortcut } from '../../src/hooks/shortcuts'

const ev = (over: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }>) =>
  ({ key: 't', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over })

describe('resolveShortcut', () => {
  test('returns null without a command modifier', () => {
    expect(resolveShortcut(ev({ key: 't' }))).toBeNull()
  })

  test('Cmd+T / Ctrl+T → newTab', () => {
    expect(resolveShortcut(ev({ key: 't', metaKey: true }))).toEqual({ type: 'newTab' })
    expect(resolveShortcut(ev({ key: 't', ctrlKey: true }))).toEqual({ type: 'newTab' })
  })

  test('Cmd+W → closeTab', () => {
    expect(resolveShortcut(ev({ key: 'w', metaKey: true }))).toEqual({ type: 'closeTab' })
  })

  test('Cmd+R → run', () => {
    expect(resolveShortcut(ev({ key: 'r', metaKey: true }))).toEqual({ type: 'run' })
  })

  test('Cmd+F → focusFilter', () => {
    expect(resolveShortcut(ev({ key: 'f', metaKey: true }))).toEqual({ type: 'focusFilter' })
  })

  test('Cmd+1..9 → switchTab with a 0-based index', () => {
    expect(resolveShortcut(ev({ key: '1', metaKey: true }))).toEqual({ type: 'switchTab', index: 0 })
    expect(resolveShortcut(ev({ key: '9', metaKey: true }))).toEqual({ type: 'switchTab', index: 8 })
  })

  test('is case-insensitive on the key', () => {
    expect(resolveShortcut(ev({ key: 'T', metaKey: true }))).toEqual({ type: 'newTab' })
  })

  test('ignores combos with Alt (avoids clobbering system/IME chords)', () => {
    expect(resolveShortcut(ev({ key: 't', metaKey: true, altKey: true }))).toBeNull()
  })

  test('returns null for unmapped keys', () => {
    expect(resolveShortcut(ev({ key: 'q', metaKey: true }))).toBeNull()
    expect(resolveShortcut(ev({ key: '0', metaKey: true }))).toBeNull()
  })
})
