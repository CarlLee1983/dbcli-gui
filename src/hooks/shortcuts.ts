/** Keyboard-shortcut layer for Sequel Ace-style muscle memory (Cmd on macOS, Ctrl elsewhere). */

export type ShortcutAction =
  | { type: 'newTab' }
  | { type: 'closeTab' }
  | { type: 'run' }
  | { type: 'focusFilter' }
  | { type: 'switchTab'; index: number }

interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/**
 * Map a keydown to an app action, or null when it isn't a recognised shortcut. Requires the
 * command modifier (⌘ or Ctrl) and rejects Alt combos so IME / system chords pass through.
 */
export function resolveShortcut(e: KeyEventLike): ShortcutAction | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null
  const key = e.key.toLowerCase()
  switch (key) {
    case 't': return { type: 'newTab' }
    case 'w': return { type: 'closeTab' }
    case 'r': return { type: 'run' }
    case 'f': return { type: 'focusFilter' }
    default: {
      if (key >= '1' && key <= '9') return { type: 'switchTab', index: Number(key) - 1 }
      return null
    }
  }
}

/** Focus targets for Cmd+F, in priority order (content filter → result search → table search). */
export const FILTER_FOCUS_SELECTORS = ['[aria-label="篩選值"]', '[aria-label="搜尋結果"]', '[aria-label="搜尋資料表"]'] as const
