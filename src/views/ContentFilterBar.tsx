import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { FILTER_OPS, isUnaryOp, type ContentFilter, type FilterOp } from './content-query'

export interface ContentFilterBarProps {
  columns: Array<{ name: string }>
  /** The currently applied filter (null = none); drives the clear affordance + draft seed. */
  filter: ContentFilter | null
  onApply(filter: ContentFilter | null): void
}

/**
 * Sequel Ace-style content filter bar: [column] [operator] [value] [篩選] [✕].
 * Holds a local draft so typing doesn't re-query on every keystroke — the query fires only on
 * "篩選" / Enter. Unary operators (IS NULL / IS NOT NULL) disable the value input.
 */
export function ContentFilterBar({ columns, filter, onApply }: ContentFilterBarProps) {
  const firstCol = columns[0]?.name ?? ''
  const [column, setColumn] = useState(filter?.column ?? firstCol)
  const [op, setOp] = useState<FilterOp>(filter?.op ?? '=')
  const [value, setValue] = useState(filter?.value ?? '')

  // Re-seed the draft when the applied filter changes externally (e.g. another tab / clear).
  useEffect(() => {
    setColumn(filter?.column ?? firstCol)
    setOp(filter?.op ?? '=')
    setValue(filter?.value ?? '')
  }, [filter, firstCol])

  const unary = isUnaryOp(op)
  const apply = () => onApply({ column, op, value: unary ? '' : value })
  const clear = () => onApply(null)

  const inputCls = 'rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-xs text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:outline-none'

  return (
    <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-2 py-1.5">
      <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
      <select aria-label="篩選欄位" value={column} onChange={(e) => setColumn(e.target.value)} className={`${inputCls} max-w-[10rem] cursor-pointer`}>
        {columns.map((c) => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>
      <select aria-label="篩選運算子" value={op} onChange={(e) => setOp(e.target.value as FilterOp)} className={`${inputCls} cursor-pointer`}>
        {FILTER_OPS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <input
        aria-label="篩選值"
        value={value}
        disabled={unary}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply() } }}
        placeholder={unary ? '—' : '值'}
        className={`${inputCls} min-w-0 flex-1 disabled:opacity-40`}
      />
      <button
        type="button"
        onClick={apply}
        className="flex-shrink-0 rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500 transition-colors cursor-pointer"
      >
        篩選
      </button>
      {filter ? (
        <button
          type="button"
          aria-label="清除篩選"
          onClick={clear}
          className="flex-shrink-0 rounded border border-slate-300 dark:border-slate-700 p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}
