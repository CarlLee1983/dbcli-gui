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
    <div className="flex flex-1 items-start gap-2">
      <textarea
        value={sql}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="SQL 查詢"
        spellCheck={false}
        placeholder="SELECT * FROM …   (Cmd/Ctrl+Enter 執行)"
        className="h-20 flex-1 resize-y rounded border border-gray-300 p-2 font-mono text-sm focus:border-gray-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={onRun}
        disabled={loading}
        className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
      >
        <Play className="h-4 w-4" /> Run
      </button>
    </div>
  )
}
