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
    <aside aria-label="查詢歷史" className="flex w-72 flex-col border-l border-gray-200 bg-gray-50 text-sm">
      <header className="flex items-center justify-between border-b border-gray-200 p-2">
        <h2 className="flex items-center gap-1 text-xs font-semibold uppercase text-gray-400">
          <History className="h-3 w-3" /> 查詢歷史
        </h2>
        <button type="button" aria-label="清除歷史" onClick={onClear} className="rounded p-1 hover:bg-gray-200" disabled={entries.length === 0}>
          <Trash2 className="h-3 w-3" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {entries.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-gray-400">尚無查詢歷史</p>
        ) : (
          <ul>
            {entries.map((e) => (
              <li key={`${e.connectionId}:${e.ts}`}>
                <button
                  type="button"
                  onClick={() => onPick(e.sql)}
                  className="flex w-full flex-col gap-0.5 rounded px-2 py-1 text-left hover:bg-gray-200"
                >
                  <span className="truncate font-mono text-xs">{e.sql}</span>
                  <span className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span>{e.connectionId ?? '—'}</span>
                    <span>· {e.rowCount} 列</span>
                    <span>· {relativeTime(e.ts, now)}</span>
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
