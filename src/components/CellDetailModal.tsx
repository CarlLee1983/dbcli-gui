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
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <span className="font-medium">{field}</span>
          <button type="button" aria-label="關閉" onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </header>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-sm">{formatted}</pre>
        <footer className="flex justify-end gap-2 border-t border-gray-200 px-4 py-2">
          <button type="button" onClick={() => copy(formatted)} className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100">
            <Copy className="h-3 w-3" /> 複製值
          </button>
          <button type="button" onClick={() => copy(JSON.stringify(row))} className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100">
            <Copy className="h-3 w-3" /> 複製整列
          </button>
        </footer>
      </div>
    </div>
  )
}
