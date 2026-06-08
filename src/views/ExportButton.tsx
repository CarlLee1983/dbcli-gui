import { useState } from 'react'
import { Download } from 'lucide-react'

export interface ExportButtonProps {
  hasResult: boolean
  onExport(format: 'csv' | 'json'): void
}

export function ExportButton({ hasResult, onExport }: ExportButtonProps) {
  const [format, setFormat] = useState<'csv' | 'json' | ''>('')
  return (
    <label className={`flex items-center gap-1 text-sm text-gray-600 ${!hasResult ? 'opacity-50' : ''}`}>
      <span className="sr-only">匯出格式</span>
      <Download className="h-4 w-4" aria-hidden="true" />
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
        className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
      >
        <option value="" disabled>匯出</option>
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
    </label>
  )
}
