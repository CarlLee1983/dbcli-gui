import { X } from 'lucide-react'
import type { ApiError } from '../api/client'

const FRIENDLY: Record<string, string> = {
  BLACKLISTED: '此表受保護，無法存取',
  PERMISSION: '唯讀模式，不允許寫入語句',
  NOT_OPEN: '連線未開啟，正在重新連線…',
  CONNECTION: '資料庫連線失敗',
  BAD_REQUEST: '請求格式錯誤',
}

export function ErrorBanner({ error, onDismiss }: { error: ApiError | null; onDismiss: () => void }) {
  if (!error) return null
  const message = FRIENDLY[error.code] ?? '發生未預期錯誤'
  if (!FRIENDLY[error.code]) console.error('[dbcli] unexpected error:', error.code, error.message)
  return (
    <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
      <span>{message}</span>
      <button type="button" aria-label="關閉" onClick={onDismiss} className="rounded p-1 hover:bg-red-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
