import { useState } from 'react'
import { Trash2, X, Plus } from 'lucide-react'
import type { TableSchemaDto, MutateOps, Permission } from '../api/types'
import { useDataEdit } from '../hooks/useDataEdit'
import { buildMutateOps, rowKeyOf, pendingCount } from '../hooks/data-edit'
import { nextSortDir, type SortDir } from './grid-virtual'
import { ContentFilterBar } from './ContentFilterBar'
import { ContentPager } from './ContentPager'
import { DEFAULT_PAGE_SIZE, type ContentFilter } from './content-query'
import { ContextMenu, useContextMenu, type ContextMenuItem } from '../components/ContextMenu'
import { cellText, rowToTsv, rowToCsv, rowToInsert, copyText } from './copy-format'

export interface TableBrowserProps {
  table: string
  schema: TableSchemaDto
  rows: Array<Record<string, unknown>>
  permission: Permission
  saving: boolean
  onSave(ops: MutateOps): Promise<boolean> | void
  // When set (arbitrary-SQL edit), render only the schema columns that appear in this
  // result-field list; undefined (sidebar browse) renders the full table schema.
  columns?: string[]
  // Server-side column sort: when onSort is provided, headers become clickable and clicking
  // one re-fetches the rows ordered by that column (full-table browse only).
  sortField?: string | null
  sortDir?: SortDir
  onSort?(field: string, dir: SortDir): void
  // Filter bar + pagination (full-table browse only). Present together with onSort; absent for
  // an arbitrary-SQL edit tab, which keeps its own SQL.
  filter?: ContentFilter | null
  total?: number | null
  page?: number
  pageSize?: number
  onFilter?(filter: ContentFilter | null): void
  onPage?(page: number): void
}

function canWrite(p: Permission): boolean {
  return p === 'read-write' || p === 'data-admin' || p === 'admin'
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

export function TableBrowser({ table, schema, rows, permission, saving, onSave, columns, sortField, sortDir, onSort, filter, total, page, pageSize, onFilter, onPage }: TableBrowserProps) {
  const [editMode, setEditMode] = useState(false)
  const edit = useDataEdit()
  const menu = useContextMenu()
  const pk = schema.primaryKey ?? []
  const hasPk = pk.length > 0
  const editable = hasPk && canWrite(permission)
  // Render the intersection of schema columns and the result fields (preserving schema
  // order); a full SELECT * browse passes no `columns` and renders every column.
  const cols = columns ? schema.columns.map((c) => c.name).filter((c) => columns.includes(c)) : schema.columns.map((c) => c.name)
  // A partial projection can't supply values for unprojected (possibly NOT NULL) columns,
  // so inserting a new row would fail at the DB — only offer it when all columns render.
  const canInsert = cols.length === schema.columns.length
  const byKey = Object.fromEntries(rows.map((r) => [rowKeyOf(r, pk), r]))
  const count = pendingCount(edit.edits)

  const cellMenuItems = (field: string, row: Record<string, unknown>): ContextMenuItem[] => [
    { label: '複製儲存格', onSelect: () => copyText(cellText(row[field])) },
    { label: '複製整列 (TSV)', onSelect: () => copyText(rowToTsv(row, cols)) },
    { label: '複製列為 CSV', onSelect: () => copyText(rowToCsv(row, cols)) },
    { label: '複製列為 INSERT', onSelect: () => copyText(rowToInsert(table, row, cols)) },
  ]

  // Sorting re-fetches from the server, which would discard unsaved edits — only offer it
  // while browsing (read-only), not in edit mode.
  const sortable = !!onSort && !editMode
  const onHeaderClick = (field: string) => {
    if (!onSort) return
    const dir = field === sortField ? nextSortDir(sortDir ?? null) : 'asc'
    onSort(field, dir)
  }

  const exitEdit = () => { edit.reset(); setEditMode(false) }
  const save = async () => {
    const ok = await onSave(buildMutateOps(edit.edits, byKey, pk))
    if (ok) { edit.reset(); setEditMode(false) }
  }

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-slate-900 text-xs">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-2 bg-slate-50 dark:bg-slate-900/60">
        <span className="font-semibold text-slate-700 dark:text-slate-300">{table}</span>
        {editMode ? (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400">{count} 筆待儲存</span>
            {canInsert ? (
              <button type="button" onClick={() => edit.addInsert()} className="flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1"><Plus className="h-3.5 w-3.5" />新增列</button>
            ) : null}
            <button type="button" onClick={exitEdit} className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1">取消</button>
            <button type="button" onClick={save} disabled={saving || count === 0} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">儲存{saving ? '中…' : ''}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditMode(true)} disabled={!editable} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">編輯</button>
        )}
      </div>

      {/* Filter bar — browse-only and hidden while editing (re-querying would drop staged edits). */}
      {onFilter && !editMode ? (
        <ContentFilterBar columns={schema.columns} filter={filter ?? null} onApply={onFilter} />
      ) : null}

      {!hasPk ? (
        <div className="px-3 py-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900">
          此表無主鍵,無法安全編輯。
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-left font-mono">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
            <tr>
              {cols.map((c) =>
                sortable ? (
                  <th
                    key={c}
                    onClick={() => onHeaderClick(c)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHeaderClick(c) } }}
                    tabIndex={0}
                    aria-sort={sortField === c ? (sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none') : undefined}
                    className="cursor-pointer select-none border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>{c}</span>
                      {sortField === c && sortDir ? (
                        sortDir === 'asc' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-500 dark:text-blue-400"><path d="m18 15-6-6-6 6"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-500 dark:text-blue-400"><path d="m6 9 6 6 6-6"/></svg>
                        )
                      ) : null}
                    </div>
                  </th>
                ) : (
                  <th key={c} className="border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-300 font-semibold">{c}</th>
                ),
              )}
              {editMode ? <th className="border-b border-slate-200 dark:border-slate-700 px-2 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const key = hasPk ? rowKeyOf(row, pk) : String(i)
              const deleted = edit.edits.deletes.includes(key)
              const rowUpdates = edit.edits.updates[key]
              const changed = !!rowUpdates
              return (
                <tr key={key} className={`${deleted ? 'line-through opacity-50 bg-red-50 dark:bg-red-950/20' : changed ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                  {cols.map((c) => {
                    // noUncheckedIndexedAccess: rowUpdates and rowUpdates[c] may be undefined
                    const stagedValue = rowUpdates !== undefined && c in rowUpdates ? rowUpdates[c] : undefined
                    const current = stagedValue !== undefined ? stagedValue : row[c]
                    return (
                      <td
                        key={c}
                        onContextMenu={editMode ? undefined : (e) => menu.openAt(e, cellMenuItems(c, row))}
                        className="px-3 py-1 border-b border-slate-100 dark:border-slate-800/40 text-slate-800 dark:text-slate-300"
                      >
                        {editMode && !deleted ? (
                          <input
                            aria-label={`編輯 ${c} 第 ${i + 1} 列`}
                            value={renderValue(current)}
                            onChange={(e) => edit.setCell(key, c, e.target.value)}
                            className="w-full bg-transparent outline-none focus:bg-white dark:focus:bg-slate-800 rounded px-1"
                          />
                        ) : (
                          renderValue(row[c])
                        )}
                      </td>
                    )
                  })}
                  {editMode ? (
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <button type="button" aria-label={`刪除第 ${i + 1} 列`} onClick={() => edit.toggleDelete(key)} className="text-red-500 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  ) : null}
                </tr>
              )
            })}
            {editMode
              ? edit.edits.inserts.map((draft, idx) => (
                  <tr key={`draft-${idx}`} className="bg-green-50 dark:bg-green-950/20">
                    {cols.map((c) => (
                      <td key={c} className="px-3 py-1 border-b border-slate-100 dark:border-slate-800/40">
                        <input
                          aria-label={`新增 ${c} 草稿 ${idx + 1}`}
                          value={renderValue(draft[c])}
                          onChange={(e) => edit.setInsertCell(idx, c, e.target.value)}
                          className="w-full bg-transparent outline-none focus:bg-white dark:focus:bg-slate-800 rounded px-1"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <button type="button" aria-label={`移除草稿 ${idx + 1}`} onClick={() => edit.removeInsert(idx)} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      <ContextMenu state={menu.state} onClose={menu.close} />

      {/* Pager footer — browse-only and hidden while editing. */}
      {onPage && !editMode ? (
        <ContentPager
          page={page ?? 0}
          pageSize={pageSize ?? DEFAULT_PAGE_SIZE}
          rowCount={rows.length}
          total={total ?? null}
          onPage={onPage}
        />
      ) : null}
    </div>
  )
}
