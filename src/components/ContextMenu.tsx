import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  label: string
  onSelect(): void
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

/** Open/close state for a right-click menu, positioned at the cursor. */
export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null)
  const openAt = useCallback((e: { clientX: number; clientY: number; preventDefault(): void }, items: ContextMenuItem[]) => {
    e.preventDefault()
    setState({ x: e.clientX, y: e.clientY, items })
  }, [])
  const close = useCallback(() => setState(null), [])
  return { state, openAt, close }
}

/**
 * A cursor-positioned context menu rendered into <body> (a portal, so grid overflow never
 * clips it). Any click / second right-click / scroll / Escape dismisses it.
 */
export function ContextMenu({ state, onClose }: { state: ContextMenuState | null; onClose(): void }) {
  useEffect(() => {
    if (!state) return
    // A mousedown outside the menu (left- or right-click elsewhere), a scroll, or Escape closes
    // it. Right-clicking another cell fires mousedown (close) then contextmenu (reopen), so the
    // menu moves rather than vanishing. Listeners attach on the next tick so the very event that
    // opened the menu can't immediately close it.
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!t?.closest?.('[role="menu"]')) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const id = setTimeout(() => {
      window.addEventListener('mousedown', onDown, true)
      window.addEventListener('scroll', onClose, true)
      // Capture phase: focus may sit in CodeMirror, which handles Escape and stops its
      // propagation — capture lets the menu still see it.
      window.addEventListener('keydown', onKey, true)
    }, 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [state, onClose])

  if (!state) return null

  return createPortal(
    <ul
      role="menu"
      style={{ position: 'fixed', top: state.y, left: state.x, zIndex: 60 }}
      className="min-w-[10rem] overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800"
      // Stop the menu's own contextmenu from re-closing/reopening oddly.
      onContextMenu={(e) => e.preventDefault()}
    >
      {state.items.map((item, i) => (
        <li key={i}>
          <button
            type="button"
            role="menuitem"
            onClick={() => { item.onSelect(); onClose() }}
            className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 cursor-pointer"
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  )
}
