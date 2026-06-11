import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface ContentPagerProps {
  /** 0-based page index. */
  page: number
  pageSize: number
  /** Number of rows on the current page (for the displayed range end). */
  rowCount: number
  /** Total rows behind the active filter; null = unknown (count failed/skipped). */
  total: number | null
  onPage(page: number): void
}

/** Footer pager: "start–end / total" with prev/next, mirroring Sequel Ace's content footer. */
export function ContentPager({ page, pageSize, rowCount, total, onPage }: ContentPagerProps) {
  const start = rowCount === 0 ? 0 : page * pageSize + 1
  const end = page * pageSize + rowCount
  const range = total != null ? `${start}–${end} / ${total.toLocaleString()}` : `${start}–${end}`

  const prevDisabled = page === 0
  // Known total: stop when this page reaches it. Unknown total: a non-full page is the last one.
  const nextDisabled = total != null ? end >= total : rowCount < pageSize

  const btn = 'flex items-center gap-0.5 rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-default cursor-pointer transition-colors'

  return (
    <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className="font-mono tabular-nums">{range}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="上一頁" disabled={prevDisabled} onClick={() => onPage(page - 1)} className={btn}>
          <ChevronLeft className="h-3.5 w-3.5" /> 上一頁
        </button>
        <button type="button" aria-label="下一頁" disabled={nextDisabled} onClick={() => onPage(page + 1)} className={btn}>
          下一頁 <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
