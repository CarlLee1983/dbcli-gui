import { useState } from 'react'
import { Table2, Eye, Play, Database, KeyRound } from 'lucide-react'
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
}

export function Sidebar(props: SidebarProps) {
  const { connections, activeConnectionId, tree, expandedColumns } = props
  const [tableQuery, setTableQuery] = useState('')
  const visibleTree = filterTree(tree, tableQuery)
  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-gray-50 text-sm">
      <section className="border-b border-gray-200 p-2">
        <h2 className="mb-1 flex items-center gap-1 px-1 text-xs font-semibold uppercase text-gray-400">
          <Database className="h-3 w-3" /> 連線
        </h2>
        <ul>
          {connections.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => props.onSelectConnection(c.name)}
                className={`flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-gray-200 ${
                  c.name === activeConnectionId ? 'bg-gray-200 font-medium' : ''
                }`}
              >
                <span>{c.name}</span>
                {c.isDefault ? <span className="text-xs text-gray-400">預設</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="min-h-0 flex-1 overflow-auto p-2">
        <h2 className="mb-1 px-1 text-xs font-semibold uppercase text-gray-400">資料表</h2>
        <input
          type="search"
          aria-label="搜尋資料表"
          value={tableQuery}
          onChange={(e) => setTableQuery(e.target.value)}
          placeholder="搜尋資料表…"
          className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-gray-500 focus:outline-none"
        />
        <ul>
          {visibleTree.map((t) => {
            const columns = expandedColumns[t.name]
            return (
              <li key={t.name}>
                <div className="group flex items-center gap-1 rounded px-1 hover:bg-gray-200">
                  <button
                    type="button"
                    onClick={() => props.onLoadColumns(t.name)}
                    className="flex flex-1 items-center gap-1 py-1 text-left"
                  >
                    {t.type === 'view' ? <Eye className="h-3 w-3 text-gray-400" /> : <Table2 className="h-3 w-3 text-gray-400" />}
                    <span>{t.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`查詢 ${t.name}`}
                    onClick={() => props.onInsertSelect(t.name)}
                    className="p-1 opacity-0 hover:text-gray-800 focus:opacity-100 focus:ring-1 focus:ring-blue-400 group-hover:opacity-100"
                  >
                    <Play className="h-3 w-3" />
                  </button>
                </div>
                {columns ? (
                  <ul className="ml-5 border-l border-gray-200 pl-2 text-xs text-gray-600">
                    {columns.map((col) => (
                      // SQL columns within a table are unique by name
                      <li key={col.name} className="flex items-center gap-1 py-0.5">
                        {col.primaryKey ? <KeyRound className="h-3 w-3 text-amber-500" aria-label="主鍵" /> : null}
                        <span>{col.name}</span>
                        <span className="text-gray-400">{col.type}</span>
                        {col.primaryKey ? <span className="text-amber-600">PK</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>
    </aside>
  )
}
