import { History, Trash2 } from 'lucide-react'
import { relativeTime, type HistoryEntry } from '../hooks/useHistory'

export interface HistoryPanelProps {
  entries: HistoryEntry[]
  now: number
  onPick(sql: string): void
  onClear(): void
}

export function HistoryPanel({ entries, now, onPick, onClear }: HistoryPanelProps) {
  return (
    <aside aria-label="查詢歷史" className="flex h-full w-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-sm">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500 tracking-wider">
          <History className="h-3.5 w-3.5" /> 查詢歷史
        </h2>
        <button 
          type="button" 
          aria-label="清除歷史" 
          onClick={onClear} 
          className="rounded p-1 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" 
          disabled={entries.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {entries.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400 dark:text-slate-500">尚無查詢歷史</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((e) => (
              <li key={`${e.connectionId}:${e.ts}`}>
                <button
                  type="button"
                  onClick={() => onPick(e.sql)}
                  className="flex w-full flex-col gap-1 rounded-md p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-800"
                >
                  <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">{e.sql}</span>
                  <span className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                    <span className="font-mono">{e.connectionId ?? '—'}</span>
                    <span>·</span>
                    <span>{e.rowCount} 列</span>
                    <span>·</span>
                    <span>{relativeTime(e.ts, now)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
