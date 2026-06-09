import { useMemo, useRef, useState } from 'react'
import type { QueryResultDto } from '../api/types'
import { computeVisibleRange, nextSortDir, sortRows, type SortDir } from './grid-virtual'
import { filterRows } from './row-filter'
import { CellDetailModal } from '../components/CellDetailModal'

const ROW_HEIGHT = 28
const VIEWPORT_HEIGHT = 480
const OVERSCAN = 8

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function ResultGrid({ result }: { result: QueryResultDto | null }) {
  const [scrollTop, setScrollTop] = useState(0)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<{ field: string; value: unknown; row: Record<string, unknown> } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    if (!result) return []
    const filtered = filterRows(result.rows, result.fields, query)
    if (!sortField || !sortDir) return filtered
    return sortRows(filtered, sortField, sortDir)
  }, [result, sortField, sortDir, query])

  if (!result) {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-400">尚無結果，執行查詢以查看資料</div>
  }

  const range = computeVisibleRange({
    scrollTop,
    viewportHeight: VIEWPORT_HEIGHT,
    rowHeight: ROW_HEIGHT,
    rowCount: sorted.length,
    overscan: OVERSCAN,
  })
  const visible = sorted.slice(range.start, range.end)

  const onHeaderClick = (field: string) => {
    if (field === sortField) {
      const dir = nextSortDir(sortDir)
      setSortDir(dir)
      if (dir === null) setSortField(null)
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    setScrollTop(0)
    scrollRef.current?.scrollTo?.({ top: 0 })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 p-1">
        <input
          type="search"
          aria-label="搜尋結果"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setScrollTop(0) }}
          placeholder="搜尋結果…"
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-gray-500 focus:outline-none"
        />
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto"
        style={{ maxHeight: VIEWPORT_HEIGHT }}
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {result.fields.map((f) => (
                <th
                  key={f}
                  onClick={() => onHeaderClick(f)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHeaderClick(f) } }}
                  tabIndex={0}
                  aria-sort={sortField === f ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className="cursor-pointer select-none border-b border-gray-300 px-3 py-1 text-left font-medium"
                >
                  {f}
                  {sortField === f ? <span className="ml-1 text-gray-400">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {range.topPad > 0 ? (
              <tr style={{ height: range.topPad }}><td colSpan={result.fields.length} /></tr>
            ) : null}
            {visible.map((row, i) => (
              <tr key={range.start + i} style={{ height: ROW_HEIGHT }} className="border-b border-gray-100">
                {result.fields.map((f) => (
                  <td
                    key={f}
                    data-col={f}
                    onClick={() => setDetail({ field: f, value: row[f], row })}
                    className="cursor-pointer truncate px-3 font-mono hover:bg-blue-50"
                  >
                    {renderCell(row[f])}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr><td colSpan={result.fields.length} className="py-6 text-center text-sm text-gray-400">查詢傳回 0 筆資料</td></tr>
            ) : null}
            {range.bottomPad > 0 ? (
              <tr style={{ height: range.bottomPad }}><td colSpan={result.fields.length} /></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-gray-200 px-3 py-1 text-xs text-gray-500">
        {result.rowCount} 列{result.ms !== null ? ` · ${result.ms} ms` : ''}
      </footer>
      {detail ? (
        <CellDetailModal field={detail.field} value={detail.value} row={detail.row} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  )
}
