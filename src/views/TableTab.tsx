import { useEffect } from 'react'
import { SquarePen } from 'lucide-react'
import type { TableSession, LazyKey } from '../hooks/tabs-reducer'
import type { SubTab, MutateOps, Permission } from '../api/types'
import { StructureTab } from './table/StructureTab'
import { RelationsTab } from './table/RelationsTab'
import { TriggersTab } from './table/TriggersTab'
import { InfoTab } from './table/InfoTab'
import { TableBrowser } from './TableBrowser'

const TABS: Array<{ key: SubTab; label: string }> = [
  { key: 'structure', label: '結構' },
  { key: 'content', label: '內容' },
  { key: 'relations', label: '關聯' },
  { key: 'triggers', label: '觸發器' },
  { key: 'info', label: '資訊' },
]

const LAZY: Record<SubTab, LazyKey | null> = {
  structure: null, content: null, relations: 'relations', triggers: 'triggers', info: 'info',
}

export interface TableTabProps {
  session: TableSession
  permission: Permission
  saving: boolean
  onSetSubTab(subTab: SubTab): void
  onLoadSubTab(key: LazyKey): void
  onLoadContent(): void
  onOpenQuery(sql: string): void
  onSave(ops: MutateOps): Promise<boolean> | void
}

export function TableTab({ session, permission, saving, onSetSubTab, onLoadSubTab, onLoadContent, onOpenQuery, onSave }: TableTabProps) {
  const { subTab } = session

  // When the active sub-tab is lazy and uncached, fetch it (covers programmatic opens, e.g. edit flow).
  // Content is not in LAZY (its rows live on the session, not a cache slot) but loads the same way:
  // a tab opened on Structure carries no rows, so showing Content must fetch them.
  useEffect(() => {
    const key = LAZY[subTab]
    if (key && session[key] === undefined && !session.cacheErrors?.[key]) onLoadSubTab(key)
    if (subTab === 'content' && session.rows === undefined) onLoadContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, session.table])

  const selectTab = (key: SubTab) => {
    onSetSubTab(key)
    const lazy = LAZY[key]
    // Intentionally not guarded on cacheErrors (unlike the effect above): a manual click on
    // a sub-tab that previously errored should retry the fetch. The effect skips errored
    // sub-tabs so a programmatic open doesn't auto-loop on a persistent failure.
    if (lazy && session[lazy] === undefined) onLoadSubTab(lazy)
    if (key === 'content' && session.rows === undefined) onLoadContent()
  }

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-2">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={`px-3 py-2 text-xs transition-colors cursor-pointer border-b-2 ${
                subTab === t.key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onOpenQuery(`SELECT * FROM ${session.table} LIMIT 100`)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer"
        >
          <SquarePen className="h-3.5 w-3.5" /> 以此表開新查詢
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {subTab === 'structure' && <StructureTab schema={session.schema} />}
        {subTab === 'content' && (
          <TableBrowser
            table={session.table}
            schema={session.schema}
            rows={session.rows ?? []}
            columns={session.fields}
            permission={permission}
            saving={saving}
            onSave={onSave}
          />
        )}
        {subTab === 'relations' && <RelationsTab relations={session.relations} error={session.cacheErrors?.relations} />}
        {subTab === 'triggers' && <TriggersTab triggers={session.triggers} error={session.cacheErrors?.triggers} />}
        {subTab === 'info' && <InfoTab info={session.info} error={session.cacheErrors?.info} />}
      </div>
    </div>
  )
}
