import { useState } from 'react'
import { Download, ChevronDown } from 'lucide-react'

export interface ExportButtonProps {
  hasResult: boolean
  onExport(format: 'csv' | 'json'): void
}

export function ExportButton({ hasResult, onExport }: ExportButtonProps) {
  const [format, setFormat] = useState<'csv' | 'json' | ''>('')

  return (
    <div className="relative inline-flex group">
      {/* Visual Button */}
      <div 
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
          ${!hasResult 
            ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50' 
            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-95 cursor-pointer shadow-sm'
          }
        `}
      >
        <Download className={`h-3.5 w-3.5 ${!hasResult ? 'text-slate-400 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`} aria-hidden="true" />
        <span>Export</span>
        <ChevronDown className={`h-3 w-3 transition-transform group-hover:translate-y-0.5 ${!hasResult ? 'text-slate-400 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`} aria-hidden="true" />
      </div>

      {/* Hidden Select Overlay */}
      <select
        aria-label="Export format"
        value={format}
        disabled={!hasResult}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'csv' || v === 'json') {
            onExport(v)
            setFormat('')
          }
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      >
        <option value="" disabled>Export</option>
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
    </div>
  )
}
