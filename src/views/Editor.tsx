import type { KeyboardEvent } from 'react'
import { Play } from 'lucide-react'

export interface EditorProps {
  sql: string
  loading: boolean
  onChange(sql: string): void
  onRun(): void
}

export function Editor({ sql, loading, onChange, onRun }: EditorProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (!loading) onRun()
    }
  }
  return (
    <div className="flex flex-1 items-start gap-2 h-full min-h-0">
      <textarea
        value={sql}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="SQL 查詢"
        spellCheck={false}
        placeholder="SELECT * FROM …   (Cmd/Ctrl+Enter 執行)"
        className="h-full w-full flex-1 resize-none rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 p-2.5 font-mono text-xs focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20 focus:outline-none transition-all"
      />
      <button
        type="button"
        onClick={onRun}
        disabled={loading}
        className="flex items-center gap-1.5 rounded bg-blue-600 dark:bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50 transition-all cursor-pointer shadow-sm hover:shadow hover:scale-[1.02] active:scale-95 flex-shrink-0"
      >
        <Play className="h-3.5 w-3.5 fill-current" /> Run
      </button>
    </div>
  )
}
