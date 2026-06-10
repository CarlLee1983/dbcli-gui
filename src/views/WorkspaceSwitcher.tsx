import { useState } from 'react'
import type { Workspace } from '../api/types'
import { inTauri } from '../api/tauri-env'

interface Props {
  workspaces: Workspace[]
  activeId: string | null
  onSelect(id: string): void
  onAdd(path: string, label?: string): Promise<void>
  onRemove(id: string): void
}

/** 開資料夾選擇:Tauri 環境用 dialog plugin,dev(瀏覽器)退回 prompt。 */
async function pickFolder(): Promise<string | null> {
  if (inTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ directory: true, multiple: false })
    return typeof picked === 'string' ? picked : null
  }
  return window.prompt('輸入專案資料夾的絕對路徑') || null
}

export function WorkspaceSwitcher({ workspaces, activeId, onSelect, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const active = workspaces.find((w) => w.id === activeId)

  const handleAdd = async () => {
    try {
      const folder = await pickFolder()
      if (folder) await onAdd(folder)
    } catch (err) {
      // 例如 Tauri 缺少 dialog:allow-open 權限時 open() 會 reject;別讓它變成無聲的 unhandled rejection。
      console.error('加入 workspace 失敗:', err)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
        title="切換 workspace"
      >
        <span>{active?.kind === 'global' ? '🌐' : '📁'}</span>
        <span className="max-w-[140px] truncate">{active?.label ?? '全域'}</span>
        <span className="opacity-50">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {workspaces.map((w) => (
              <div key={w.id} className="group flex items-center justify-between px-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                <button
                  type="button"
                  onClick={() => { onSelect(w.id); setOpen(false) }}
                  className={`flex-1 truncate py-1.5 text-left text-xs cursor-pointer ${w.id === activeId ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  {w.kind === 'global' ? '🌐 ' : '📁 '}{w.label}
                </button>
                {w.kind === 'project' && (
                  <button
                    type="button"
                    onClick={() => onRemove(w.id)}
                    className="ml-1 px-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500 cursor-pointer"
                    title="移除此 workspace"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            <button
              type="button"
              onClick={() => { setOpen(false); void handleAdd() }}
              className="w-full px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              ＋ 加入 workspace…
            </button>
          </div>
        </>
      )}
    </div>
  )
}
