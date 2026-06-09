import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { ConnectionFormInput, ConnectionDetail, SqlSystem, TestResult } from '../api/types'

export interface ConnectionFormModalProps {
  mode: 'create' | 'edit'
  initial?: ConnectionDetail
  onSubmit(input: ConnectionFormInput): Promise<void>
  onTest(input: Omit<ConnectionFormInput, 'name'>): Promise<TestResult>
  onClose(): void
}

const SYSTEMS: SqlSystem[] = ['mysql', 'postgresql', 'mariadb']
const DEFAULT_PORT: Record<SqlSystem, number> = { mysql: 3306, mariadb: 3306, postgresql: 5432 }

export function ConnectionFormModal({ mode, initial, onSubmit, onTest, onClose }: ConnectionFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [system, setSystem] = useState<SqlSystem>(initial?.system ?? 'mysql')
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState(String(initial?.port ?? DEFAULT_PORT[initial?.system ?? 'mysql']))
  const [user, setUser] = useState(initial?.user ?? '')
  const [database, setDatabase] = useState(initial?.database ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const collect = (): ConnectionFormInput => ({
    name, system, host, port: Number(port), user, database,
    ...(password !== '' ? { password } : {}),
  })

  const submit = async () => {
    setBusy(true); setTestMsg(null)
    try { await onSubmit(collect()); onClose() }
    catch { /* 錯誤由上層 error channel 顯示 */ }
    finally { setBusy(false) }
  }

  const test = async () => {
    setBusy(true); setTestMsg(null)
    try {
      const r = await onTest({ system, host, port: Number(port), user, database, ...(password !== '' ? { password } : {}) })
      setTestMsg({ ok: true, text: `連線成功 · ${r.ms}ms` })
    } catch (err) {
      setTestMsg({ ok: false, text: err instanceof Error ? err.message : '連線失敗' })
    } finally { setBusy(false) }
  }

  const field = 'w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors'

  return (
    <div role="dialog" aria-modal="true" aria-label={mode === 'create' ? '新增連線' : '編輯連線'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="flex w-full max-w-md flex-col rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/40">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{mode === 'create' ? '新增連線' : '編輯連線'}</span>
          <button type="button" aria-label="關閉" onClick={onClose} className="rounded-full p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex flex-col gap-2.5 px-4 py-4">
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">連線名稱
            <input aria-label="連線名稱" className={field} value={name} disabled={mode === 'edit'} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">系統
            <select aria-label="系統" className={field} value={system}
              onChange={(e) => { const s = e.target.value as SqlSystem; setSystem(s); if (!initial) setPort(String(DEFAULT_PORT[s])) }}>
              {SYSTEMS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">主機
              <input aria-label="主機" className={field} value={host} onChange={(e) => setHost(e.target.value)} />
            </label>
            <label className="flex w-24 flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">連接埠
              <input aria-label="連接埠" type="number" className={field} value={port} onChange={(e) => setPort(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">使用者
            <input aria-label="使用者" className={field} value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">密碼
            <input aria-label="密碼" type="password" className={field} value={password}
              placeholder={mode === 'edit' ? '•••• 留白代表不修改' : ''} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">資料庫
            <input aria-label="資料庫" className={field} value={database} onChange={(e) => setDatabase(e.target.value)} />
          </label>
          {testMsg && (
            <p className={`text-xs ${testMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{testMsg.text}</p>
          )}
        </div>

        <footer className="flex justify-between gap-2 border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/40">
          <button type="button" disabled={busy} onClick={test} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">測試連線</button>
          <button type="button" disabled={busy} onClick={submit} className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer">儲存</button>
        </footer>
      </div>
    </div>
  )
}
