import { useMemo, useRef, useState } from 'react'
import type { QueryResultDto } from '../api/types'
import { computeVisibleRange, nextSortDir, sortRows, type SortDir } from './grid-virtual'
import { filterRows } from './row-filter'
import { CellDetailModal } from '../components/CellDetailModal'
import { Search } from 'lucide-react'

const ROW_HEIGHT = 28
const VIEWPORT_HEIGHT = 480
const OVERSCAN = 8

export interface ResultGridProps {
  result: QueryResultDto | null
  filter: string
  sortField: string | null
  sortDir: SortDir
  onFilterChange(filter: string): void
  onSort(field: string, dir: SortDir): void
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function ResultGrid({ result, filter, sortField, sortDir, onFilterChange, onSort }: ResultGridProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const [detail, setDetail] = useState<{ field: string; value: unknown; row: Record<string, unknown> } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    if (!result) return []
    const filtered = filterRows(result.rows, result.fields, filter)
    if (!sortField || !sortDir) return filtered
    return sortRows(filtered, sortField, sortDir)
  }, [result, sortField, sortDir, filter])

  if (!result) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900">
        尚無結果，執行查詢以查看資料
      </div>
    )
  }

  const totalRows = result.rows.length
  const visibleRows = sorted.length
  const hasFilter = filter.trim().length > 0
  const resultSummary = hasFilter ? `顯示 ${visibleRows} / 共 ${totalRows} 列` : `共 ${totalRows} 列`
  const tableColSpan = result.fields.length + 1
  const range = computeVisibleRange({ scrollTop, viewportHeight: VIEWPORT_HEIGHT, rowHeight: ROW_HEIGHT, rowCount: visibleRows, overscan: OVERSCAN })
  const visible = sorted.slice(range.start, range.end)

  const onHeaderClick = (field: string) => {
    const dir = field === sortField ? nextSortDir(sortDir) : 'asc'
    onSort(field, dir)
    setScrollTop(0)
    scrollRef.current?.scrollTo?.({ top: 0 })
  }

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-slate-900 text-xs">
      <div className="border-b border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="search"
              aria-label="搜尋結果"
              value={filter}
              onChange={(e) => { onFilterChange(e.target.value); setScrollTop(0) }}
              placeholder="搜尋結果..."
              className="w-full rounded border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-800 transition-colors focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>
          <div className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {resultSummary}
          </div>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto bg-white dark:bg-slate-900"
        style={{ maxHeight: VIEWPORT_HEIGHT }}
      >
        <table className="w-full border-separate border-spacing-0 text-left font-mono">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
            <tr className="border-b border-slate-300 dark:border-slate-700">
              <th
                scope="col"
                className="sticky left-0 z-20 w-12 select-none border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-right font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              >
                #
              </th>
              {result.fields.map((f) => (
                <th
                  key={f}
                  onClick={() => onHeaderClick(f)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHeaderClick(f) } }}
                  tabIndex={0}
                  aria-sort={sortField === f ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className="cursor-pointer select-none border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{f}</span>
                    {sortField === f ? (
                      sortDir === 'asc' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-500 dark:text-blue-400"><path d="m18 15-6-6-6 6"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-500 dark:text-blue-400"><path d="m6 9 6 6 6-6"/></svg>
                      )
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {range.topPad > 0 ? (<tr style={{ height: range.topPad }}><td colSpan={tableColSpan} /></tr>) : null}
            {visible.map((row, i) => (
              <tr 
                key={range.start + i} 
                style={{ height: ROW_HEIGHT }} 
                className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <td aria-label={`第 ${range.start + i + 1} 列`} className="sticky left-0 z-10 w-12 border-b border-r border-slate-100 bg-slate-50 px-2 py-1 text-right font-mono text-[11px] tabular-nums text-slate-400 dark:border-slate-800/60 dark:bg-slate-900 dark:text-slate-500">
                  {range.start + i + 1}
                </td>
                {result.fields.map((f) => (
                  <td
                    key={f}
                    data-col={f}
                    onClick={() => setDetail({ field: f, value: row[f], row })}
                    className="cursor-pointer truncate px-3 py-1 text-slate-800 dark:text-slate-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 border-b border-slate-100 dark:border-slate-800/40"
                  >
                    {renderCell(row[f])}
                  </td>
                ))}
              </tr>
            ))}
            {visibleRows === 0 ? (
              <tr>
                <td colSpan={tableColSpan} className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                  {hasFilter && totalRows > 0 ? `沒有符合「${filter}」的資料` : '查詢傳回 0 筆資料'}
                </td>
              </tr>
            ) : null}
            {range.bottomPad > 0 ? (<tr style={{ height: range.bottomPad }}><td colSpan={tableColSpan} /></tr>) : null}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-slate-200 dark:border-slate-800 px-3 py-2 bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 flex justify-between items-center">
        <span>{resultSummary}</span>
        {result.ms !== null ? (
          <span className="font-mono text-[10px]">{result.ms} ms</span>
        ) : null}
      </footer>
      {detail ? (
        <CellDetailModal field={detail.field} value={detail.value} row={detail.row} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  )
}
