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
    <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-1 py-1">
      {sessions.map((s) => (
        <div
          key={s.id}
          onClick={() => onSetActive(s.id)}
          className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${s.id === activeId ? 'bg-white shadow-sm font-medium' : 'hover:bg-gray-200'}`}
        >
          {editing === s.id ? (
            <input
              autoFocus
              aria-label={`重新命名 ${s.title}`}
              defaultValue={s.title}
              onBlur={(e) => { onRename(s.id, e.target.value || s.title); setEditing(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              onClick={(e) => e.stopPropagation()}
              className="w-20 rounded border border-gray-300 px-1 text-sm"
            />
          ) : (
            <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(s.id) }}>{s.title}</span>
          )}
          <button
            type="button"
            aria-label={`關閉 ${s.title}`}
            onClick={(e) => { e.stopPropagation(); onClose(s.id) }}
            className="rounded p-0.5 opacity-0 hover:bg-gray-300 focus:opacity-100 group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button type="button" aria-label="開新分頁" onClick={onOpen} className="rounded p-1 hover:bg-gray-200">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
