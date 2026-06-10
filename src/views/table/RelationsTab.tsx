import type { RelationsDto } from '../../api/types'
import type { SubTabError } from '../../hooks/tabs-reducer'

export function RelationsTab({ relations, error }: { relations: RelationsDto | undefined; error: SubTabError | undefined }) {
  if (error) return <div className="p-4 text-xs text-red-600 dark:text-red-400">{error.message}</div>
  if (relations === undefined) return <div className="p-4 text-xs text-slate-400">載入中…</div>
  const { forward, reverse } = relations
  if (forward.length === 0 && reverse.length === 0) {
    return <div className="p-4 text-xs text-slate-400 dark:text-slate-500">此表沒有關聯。</div>
  }
  return (
    <div className="h-full overflow-auto p-3 text-xs font-mono">
      <section className="mb-4">
        <h3 className="mb-1 text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">正向外鍵(本表 → 參照)</h3>
        {forward.length === 0 ? <p className="text-slate-400">(無)</p> : (
          <ul className="flex flex-col gap-0.5">
            {forward.map((r, i) => (
              <li key={`f-${i}`} className="text-slate-700 dark:text-slate-300"><span>{r.fromColumn}</span> → {r.toTable}.{r.toColumn}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">反向(被誰參照)</h3>
        {reverse.length === 0 ? <p className="text-slate-400">(無)</p> : (
          <ul className="flex flex-col gap-0.5">
            {reverse.map((r, i) => (
              <li key={`r-${i}`} className="text-slate-700 dark:text-slate-300">{r.fromTable}.{r.fromColumn} → 本表.{r.toColumn}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
