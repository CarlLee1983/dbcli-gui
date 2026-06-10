import type { TriggerDto } from '../../api/types'
import type { SubTabError } from '../../hooks/tabs-reducer'

export function TriggersTab({ triggers, error }: { triggers: TriggerDto[] | undefined; error: SubTabError | undefined }) {
  if (error) return <div className="p-4 text-xs text-red-600 dark:text-red-400">{error.message}</div>
  if (triggers === undefined) return <div className="p-4 text-xs text-slate-400">載入中…</div>
  if (triggers.length === 0) return <div className="p-4 text-xs text-slate-400 dark:text-slate-500">此表沒有觸發器。</div>
  return (
    <div className="h-full overflow-auto p-3 text-xs">
      <ul className="flex flex-col gap-2">
        {triggers.map((t) => (
          <li key={t.name} className="rounded border border-slate-200 dark:border-slate-800 p-2">
            <div className="flex items-center gap-2 font-mono">
              <span className="font-semibold text-slate-800 dark:text-slate-200">{t.name}</span>
              <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 text-[10px] text-slate-500">{t.timing} {t.event}</span>
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-slate-600 dark:text-slate-400">{t.statement}</pre>
          </li>
        ))}
      </ul>
    </div>
  )
}
