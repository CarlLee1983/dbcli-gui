import { X } from 'lucide-react'
import type { ApiError } from '../api/client'

const FRIENDLY: Record<string, string> = {
  BLACKLISTED: '此表受保護，無法存取',
  PERMISSION: '唯讀模式，不允許寫入語句',
  NOT_OPEN: '連線未開啟，正在重新連線…',
  CONNECTION: '資料庫連線失敗',
  BAD_REQUEST: '請求格式錯誤',
  UNAUTHORIZED: '連線授權失敗',
  NOT_CONFIGURED: '尚未設定資料庫連線',
}

export function ErrorBanner({ error, onDismiss }: { error: ApiError | null; onDismiss: () => void }) {
  if (!error) return null
  const friendly = FRIENDLY[error.code]
  if (!friendly) console.error('[dbcli] unexpected error:', error.code, error.message)
  return (
    <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 dark:border-red-950/40 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-800 dark:text-red-400">
      <span className="font-medium">{friendly ?? '發生未預期錯誤'}</span>
      <button 
        type="button" 
        aria-label="關閉" 
        onClick={onDismiss} 
        className="rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
