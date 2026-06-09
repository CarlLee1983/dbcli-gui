import { useCallback, useState } from 'react'

export interface HistoryEntry {
  sql: string
  connectionId: string | null
  ts: number
  rowCount: number
}

const KEY = 'dbcli-gui:history'
const CAP = 100

/** Prepend, dedupe by sql+connectionId (newest wins), cap to CAP. Returns a NEW array. */
export function addHistoryEntry(list: HistoryEntry[], entry: HistoryEntry, cap = CAP): HistoryEntry[] {
  const deduped = list.filter((e) => !(e.sql === entry.sql && e.connectionId === entry.connectionId))
  return [entry, ...deduped].slice(0, cap)
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : []
  } catch {
    return []
  }
}

/** Coarse relative time in Traditional Chinese. */
export function relativeTime(ts: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - ts) / 1000))
  if (sec < 60) return `${sec} 秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小時前`
  return `${Math.floor(hr / 24)} 天前`
}

export interface HistoryApi {
  entries: HistoryEntry[]
  add(entry: HistoryEntry): void
  clear(): void
}

export function useHistory(): HistoryApi {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory())

  const add = useCallback((entry: HistoryEntry) => {
    setEntries((prev) => {
      const next = addHistoryEntry(prev, entry)
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage full/unavailable */ }
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setEntries([])
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  }, [])

  return { entries, add, clear }
}
