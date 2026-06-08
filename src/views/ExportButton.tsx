import { Download } from 'lucide-react'

export interface ExportButtonProps {
  hasResult: boolean
  onExport(format: 'csv' | 'json'): void
}

export function ExportButton({ hasResult, onExport }: ExportButtonProps) {
  return (
    <label className="flex items-center gap-1 text-sm text-gray-600">
      <Download className="h-4 w-4" />
      <select
        value=""
        disabled={!hasResult}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'csv' || v === 'json') onExport(v)
          e.target.value = ''
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
