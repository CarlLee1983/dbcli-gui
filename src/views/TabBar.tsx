import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { QuerySession } from '../hooks/tabs-reducer'

export interface TabBarProps {
  sessions: QuerySession[]
  activeId: string
  onOpen(): void
  onClose(id: string): void
  onSetActive(id: string): void
  onRename(id: string, title: string): void
}

export function TabBar({ sessions, activeId, onOpen, onClose, onSetActive, onRename }: TabBarProps) {
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 px-2 py-1.5">
      {sessions.map((s) => (
        <div
          key={s.id}
          onClick={() => onSetActive(s.id)}
          className={`group flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs transition-all cursor-pointer ${
            s.id === activeId 
              ? 'bg-white text-slate-900 border-r border-t border-l border-slate-200 font-semibold dark:bg-slate-900 dark:text-white dark:border-slate-800 shadow-sm' 
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-900/50'
          }`}
        >
          {editing === s.id ? (
            <input
              autoFocus
              aria-label={`重新命名 ${s.title}`}
              defaultValue={s.title}
              onBlur={(e) => { onRename(s.id, e.target.value || s.title); setEditing(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              onClick={(e) => e.stopPropagation()}
              className="w-20 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 py-0.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
            />
          ) : (
            <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(s.id) }} className="select-none">{s.title}</span>
          )}
          <button
            type="button"
            aria-label={`關閉 ${s.title}`}
            onClick={(e) => { e.stopPropagation(); onClose(s.id) }}
            className="rounded-full p-0.5 opacity-0 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 focus:opacity-100 group-hover:opacity-100 transition-all cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button 
        type="button" 
        aria-label="開新分頁" 
        onClick={onOpen} 
        className="rounded-full p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors ml-1 cursor-pointer flex items-center justify-center"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
