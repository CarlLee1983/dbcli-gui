import { Loader2 } from 'lucide-react'

export function Spinner({ label }: { label?: string }) {
  return (
    <div role="status" aria-label={label ?? '載入中'} className="flex items-center gap-2 text-sm text-gray-500">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </div>
  )
}
