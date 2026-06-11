import { Play } from 'lucide-react'
import { ExportButton } from './ExportButton'
import { SqlEditor } from './SqlEditor'

export interface EditorProps {
  sql: string
  loading: boolean
  hasResult: boolean
  /** Table names for SQL autocompletion. */
  tables: string[]
  /** Known columns per table (optional) for column autocompletion. */
  columnsByTable?: Record<string, string[]>
  onChange(sql: string): void
  onRun(): void
  onExport(format: 'csv' | 'json'): void
}

export function Editor({ sql, loading, hasResult, tables, columnsByTable, onChange, onRun, onExport }: EditorProps) {
  const run = () => { if (!loading) onRun() }

  return (
    <div className="flex flex-1 gap-3 h-full min-h-0">
      <div className="flex-1 min-w-0 h-full relative group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus-within:border-blue-500/50 dark:focus-within:border-blue-400/50 focus-within:ring-4 focus-within:ring-blue-500/5 dark:focus-within:ring-blue-400/5 transition-all shadow-sm group-hover:border-slate-300 dark:group-hover:border-slate-700 overflow-hidden">
        <SqlEditor
          value={sql}
          tables={tables}
          columnsByTable={columnsByTable}
          onChange={onChange}
          onRun={run}
        />
        <div className="absolute bottom-2 right-3 pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity">
           <span className="text-[10px] font-medium text-slate-400 dark:text-slate-600 bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-700/50">SQL Editor</span>
        </div>
      </div>

      <div className="flex flex-col w-28 gap-2.5 flex-shrink-0">
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 dark:bg-blue-500 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50 transition-all cursor-pointer shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 flex-shrink-0"
        >
          <Play className="h-4 w-4 fill-current" /> Run
        </button>

        <div className="h-px bg-slate-200 dark:bg-slate-800 my-0.5" />

        <ExportButton hasResult={hasResult} onExport={onExport} />

        <div className="mt-auto pb-1 text-center">
          <span className="text-[10px] text-slate-400 dark:text-slate-600 font-medium">
            ⌘ + Enter
          </span>
        </div>
      </div>
    </div>
  )
}
