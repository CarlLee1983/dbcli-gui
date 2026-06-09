import { useState } from 'react'
import { Table2, Eye, Play, Database, KeyRound, Search, Plus, Pencil, Trash2 } from 'lucide-react'
import type { ConnectionSummary, TreeTable, TableColumnDto } from '../api/types'
import { filterTree } from './tree-filter'

export interface SidebarProps {
  connections: ConnectionSummary[]
  activeConnectionId: string | null
  tree: TreeTable[]
  expandedColumns: Record<string, TableColumnDto[]>
  onSelectConnection(id: string): void
  onLoadColumns(table: string): void
  onInsertSelect(table: string): void
  onAddConnection(): void
  onEditConnection(name: string): void
  onDeleteConnection(name: string): void
}

export function Sidebar(props: SidebarProps) {
  const { connections, activeConnectionId, tree, expandedColumns } = props
  const [tableQuery, setTableQuery] = useState('')
  const visibleTree = filterTree(tree, tableQuery)
  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-sm">
      <section className="border-b border-slate-200 dark:border-slate-800 p-3">
        <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500 tracking-wider">
          <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> 連線列表</span>
          <button type="button" aria-label="新增連線" onClick={props.onAddConnection}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 cursor-pointer">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </h2>
        <ul className="flex flex-col gap-0.5">
          {connections.map((c) => (
            <li key={c.name} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => props.onSelectConnection(c.name)}
                className={`flex flex-1 items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors cursor-pointer text-xs ${
                  c.name === activeConnectionId
                    ? 'bg-blue-50 text-blue-600 font-semibold dark:bg-blue-950/40 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span>{c.name}</span>
                {c.isDefault ? (
                  <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[10px] text-slate-400 dark:text-slate-500 font-medium">預設</span>
                ) : null}
              </button>
              <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button type="button" aria-label={`編輯連線 ${c.name}`} onClick={() => props.onEditConnection(c.name)}
                  className="rounded p-1 text-slate-400 hover:text-blue-600 cursor-pointer"><Pencil className="h-3 w-3" /></button>
                <button type="button" aria-label={`刪除連線 ${c.name}`} onClick={() => props.onDeleteConnection(c.name)}
                  className="rounded p-1 text-slate-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="min-h-0 flex-1 overflow-auto p-3">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500 tracking-wider">資料表 / 檢視表</h2>
        <div className="relative mb-3 flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            aria-label="搜尋資料表"
            value={tableQuery}
            onChange={(e) => setTableQuery(e.target.value)}
            placeholder="搜尋資料表…"
            className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 pl-8 pr-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors"
          />
        </div>
        <ul className="flex flex-col gap-0.5">
          {visibleTree.map((t) => {
            const columns = expandedColumns[t.name]
            return (
              <li key={t.name}>
                <div className="group flex items-center gap-1 rounded px-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <button
                    type="button"
                    onClick={() => props.onLoadColumns(t.name)}
                    className="flex flex-1 items-center gap-2 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    {t.type === 'view' ? <Eye className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> : <Table2 className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />}
                    <span className="truncate font-mono">{t.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`查詢 ${t.name}`}
                    onClick={() => props.onInsertSelect(t.name)}
                    className="p-1 opacity-0 hover:text-blue-600 dark:hover:text-blue-400 focus:opacity-100 focus:ring-1 focus:ring-blue-400 group-hover:opacity-100 transition-all cursor-pointer rounded"
                  >
                    <Play className="h-3 w-3" />
                  </button>
                </div>
                {columns ? (
                  <ul className="ml-5 border-l border-slate-200 dark:border-slate-800 pl-2 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col gap-0.5">
                    {columns.map((col) => (
                      <li key={col.name} className="flex items-center gap-1.5 py-0.5">
                        {col.primaryKey ? (
                          <KeyRound className="h-3 w-3 text-amber-500 flex-shrink-0" aria-label="主鍵" />
                        ) : (
                          <span className="w-3" />
                        )}
                        <span className="font-mono text-slate-700 dark:text-slate-300 truncate">{col.name}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">({col.type})</span>
                        {col.primaryKey ? <span className="text-[9px] bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-500 border border-amber-200/50 dark:border-amber-900/50 rounded px-0.5 font-bold">PK</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
          {visibleTree.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-slate-400 dark:text-slate-500">找不到相符的資料表</p>
          )}
        </ul>
      </section>
    </aside>
  )
}
