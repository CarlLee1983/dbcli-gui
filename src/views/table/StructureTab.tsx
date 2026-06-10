import { KeyRound } from 'lucide-react'
import type { TableSchemaDto } from '../../api/types'

export function StructureTab({ schema }: { schema: TableSchemaDto }) {
  const pk = new Set(schema.primaryKey ?? [])
  if (schema.columns.length === 0) {
    return <div className="p-4 text-xs text-slate-400 dark:text-slate-500">此表無欄位資訊。</div>
  }
  return (
    <div className="h-full overflow-auto p-3 text-xs">
      <table className="w-full border-separate border-spacing-0 text-left font-mono">
        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
          <tr>
            {['欄位', '型別', 'Null', '預設', 'PK', '說明'].map((h) => (
              <th key={h} className="border-b border-slate-200 dark:border-slate-700 px-3 py-2 font-semibold text-slate-700 dark:text-slate-300">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schema.columns.map((c) => (
            <tr key={c.name}>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5 text-slate-800 dark:text-slate-300">{c.name}</td>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5 text-slate-500 dark:text-slate-400">{c.type}</td>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5 text-slate-500 dark:text-slate-400">{c.nullable ? 'YES' : 'NO'}</td>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5 text-slate-500 dark:text-slate-400">{c.default ?? ''}</td>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5">
                {pk.has(c.name) ? <KeyRound className="h-3.5 w-3.5 text-amber-500" aria-label="主鍵" /> : null}
              </td>
              <td className="border-b border-slate-100 dark:border-slate-800/40 px-3 py-1.5 text-slate-500 dark:text-slate-400">{c.comment ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {schema.indexes && schema.indexes.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-1 px-1 text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">索引</h3>
          <ul className="flex flex-col gap-0.5">
            {schema.indexes.map((idx) => (
              <li key={idx.name} className="px-1 py-0.5 font-mono text-slate-600 dark:text-slate-400">
                <span>{idx.name}</span> {idx.unique ? <span className="text-[10px] text-emerald-600">UNIQUE</span> : null} ({idx.columns.join(', ')})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
