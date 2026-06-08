import { useMemo, useRef, useState } from 'react'
import type { QueryResultDto } from '../api/types'
import { computeVisibleRange, nextSortDir, sortRows, type SortDir } from './grid-virtual'

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
  const scrollRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    if (!result) return []
    if (!sortField || !sortDir) return result.rows
    return sortRows(result.rows, sortField, sortDir)
  }, [result, sortField, sortDir])

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
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto"
        style={{ maxHeight: VIEWPORT_HEIGHT }}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-gray-100">
            <tr>
              {result.fields.map((f) => (
                <th
                  key={f}
                  onClick={() => onHeaderClick(f)}
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
                  <td key={f} data-col={f} className="truncate px-3 font-mono">{renderCell(row[f])}</td>
                ))}
              </tr>
            ))}
            {range.bottomPad > 0 ? (
              <tr style={{ height: range.bottomPad }}><td colSpan={result.fields.length} /></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {/* data-count is read by the CSS rule below; kept out of text nodes so tests
          can query /rowCount/ and /ms/ independently without cross-contamination. */}
      <style>{`.rg-footer[data-count]::before{content:attr(data-count)" 列 · "}`}</style>
      <footer
        data-count={String(result.rowCount)}
        className="rg-footer border-t border-gray-200 px-3 py-1 text-xs text-gray-500"
        aria-label={`${result.rowCount} 列${result.ms !== null ? ` · ${result.ms} ms` : ''}`}
      >
        {result.ms !== null ? `${result.ms} ms` : ''}
      </footer>
    </div>
  )
}
