import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { buildSqlSchema } from './sql-schema'

export interface SqlEditorProps {
  value: string
  /** Table names for FROM/JOIN autocompletion. */
  tables: string[]
  /** Known columns per table (optional) for column autocompletion. */
  columnsByTable?: Record<string, string[]>
  onChange(value: string): void
  onRun(): void
}

function isDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '14px', height: '100%' },
  '.cm-content': { fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: '#94a3b8' },
  '.cm-scroller': { overflow: 'auto' },
  '&.cm-focused': { outline: 'none' },
})

/**
 * CodeMirror 6 SQL editor: syntax highlighting, line numbers, bracket matching, and
 * schema-aware autocompletion (basicSetup) with ⌘/Ctrl+Enter to run. Self-detects the app's
 * light/dark theme by observing the `.dark` class on <html>, so it needs no theme prop.
 * Refs hold the latest onChange/onRun so the keymap/listener never need reconfiguring.
 */
export function SqlEditor({ value, tables, columnsByTable, onChange, onRun }: SqlEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onRunRef = useRef(onRun)
  onChangeRef.current = onChange
  onRunRef.current = onRun
  const themeCompartment = useRef(new Compartment())
  const langCompartment = useRef(new Compartment())

  // Create the view once.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const langExt = sql({ schema: buildSqlSchema(tables, columnsByTable), upperCaseKeywords: true })
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          lineNumbers(),
          themeCompartment.current.of(isDark() ? oneDark : lightTheme),
          langCompartment.current.of(langExt),
          keymap.of([{ key: 'Mod-Enter', preventDefault: true, run: () => { onRunRef.current(); return true } }]),
          EditorView.updateListener.of((u) => { if (u.docChanged) onChangeRef.current(u.state.doc.toString()) }),
          EditorView.contentAttributes.of({ 'aria-label': 'SQL 查詢', spellcheck: 'false' }),
          EditorView.lineWrapping,
        ],
      }),
    })
    viewRef.current = view

    // Track the app theme (.dark on <html>) and swap CodeMirror's theme to match.
    const observer = new MutationObserver(() => {
      view.dispatch({ effects: themeCompartment.current.reconfigure(isDark() ? oneDark : lightTheme) })
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => { observer.disconnect(); view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (history pick / insert-select) without clobbering local edits.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  // Reconfigure completion schema when the table/column set changes.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: langCompartment.current.reconfigure(
        sql({ schema: buildSqlSchema(tables, columnsByTable), upperCaseKeywords: true }),
      ),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(''), JSON.stringify(columnsByTable ?? {})])

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />
}
