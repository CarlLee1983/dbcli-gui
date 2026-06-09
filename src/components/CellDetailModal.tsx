import { useEffect } from 'react'
import { X, Copy } from 'lucide-react'

export interface CellDetailModalProps {
  field: string
  value: unknown
  row: Record<string, unknown>
  onClose(): void
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export function CellDetailModal({ field, value, row, onClose }: CellDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const formatted = formatValue(value)
  const copy = (text: string) => { void navigator.clipboard?.writeText(text) }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${field} 內容`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-all"
      onClick={onClose}
    >
      <div 
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/40">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{field}</span>
          <button 
            type="button" 
            aria-label="關閉" 
            onClick={onClose} 
            className="rounded-full p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-xs text-slate-800 dark:text-slate-300">{formatted}</pre>
        <footer className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/40">
          <button 
            type="button" 
            onClick={() => copy(formatted)} 
            className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" /> 複製值
          </button>
          <button 
            type="button" 
            onClick={() => copy(JSON.stringify(row))} 
            className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" /> 複製整列
          </button>
        </footer>
      </div>
    </div>
  )
}
