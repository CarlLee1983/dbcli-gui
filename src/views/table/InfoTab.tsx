import type { TableInfoDto } from '../../api/types'
import type { SubTabError } from '../../hooks/tabs-reducer'

function fmtBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function InfoTab({ info, error }: { info: TableInfoDto | undefined; error: SubTabError | undefined }) {
  if (error) return <div className="p-4 text-xs text-red-600 dark:text-red-400">{error.message}</div>
  if (info === undefined) return <div className="p-4 text-xs text-slate-400">載入中…</div>
  const rows: Array<[string, string]> = [
    ['引擎', info.engine ?? '—'],
    ['字元集 / 定序', info.collation ?? '—'],
    ['列數(估計)', info.rowCount == null ? '—' : String(info.rowCount)],
    ['大小', fmtBytes(info.sizeBytes)],
    ['建立時間', info.createdAt ?? '—'],
  ]
  return (
    <div className="h-full overflow-auto p-3 text-xs">
      <table className="mb-4 text-left">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="py-1 pr-4 text-slate-400 dark:text-slate-500">{k}</td>
              <td className="py-1 font-mono text-slate-800 dark:text-slate-200">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mb-1 text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">建立語句</h3>
      {info.createSql ? (
        <pre className="overflow-auto rounded bg-slate-50 dark:bg-slate-800/60 p-2 font-mono text-[11px] text-slate-700 dark:text-slate-300">{info.createSql}</pre>
      ) : (
        <p className="text-slate-400 dark:text-slate-500">此系統不提供 CREATE 原文(可參考「結構」子頁籤)。</p>
      )}
    </div>
  )
}
