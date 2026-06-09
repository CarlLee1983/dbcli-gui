import { useState } from 'react'
import { Download } from 'lucide-react'

export interface ExportButtonProps {
  hasResult: boolean
  onExport(format: 'csv' | 'json'): void
}

export function ExportButton({ hasResult, onExport }: ExportButtonProps) {
  const [format, setFormat] = useState<'csv' | 'json' | ''>('')
  return (
    <label className={`flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 ${!hasResult ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className="sr-only">匯出格式</span>
      <Download className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      <select
        aria-label="匯出格式"
        value={format}
        disabled={!hasResult}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'csv' || v === 'json') {
            onExport(v)
            setFormat('')
          }
        }}
        className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1.5 focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-50 cursor-pointer"
      >
        <option value="" disabled>匯出</option>
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
    </label>
  )
}
