# UI/UX Optimization and Theme Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the dbcli-gui application's UI/UX to make it highly polished, support custom resizable horizontal and vertical panel splits with collapse/expand capabilities, and implement light, dark, and system themes using Lucide React SVG icons.

**Architecture:** Create a React state hook to control dark/light/system theme mode, setting the `.dark` class on the root element. Implement a custom React mouse handler hook/manager in `App.tsx` to handle vertical and horizontal drags on splitters, storing panel dimensions in `localStorage`. Style each view using Tailwind CSS v4 variants (`dark:bg-slate-900`, etc.) and replace text-based/emoji icons with inline SVG/Lucide React icons.

**Tech Stack:** React 19, Tailwind CSS v4, Lucide React, TypeScript, Bun.

---

### Task 1: Setup Tailwind Dark Mode and Scrollbar Styles

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Update `src/index.css` to add dark mode variant and modern scrollbars**

```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
}

@variant dark (&:where(.dark, .dark *));

/* Custom scrollbar styles */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
.dark ::-webkit-scrollbar-thumb {
  background: #334155;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
.dark ::-webkit-scrollbar-thumb:hover {
  background: #475569;
}

html,
body,
#root {
  height: 100%;
}

body {
  font-family: var(--font-sans);
  margin: 0;
}
```

- [ ] **Step 2: Commit changes**

```bash
git add src/index.css
git commit -m "style: configure tailwind dark mode variant and webkit scrollbar styles"
```

---

### Task 2: Implement Theme Management Hook

**Files:**
- Create: `src/hooks/useTheme.ts`

- [ ] **Step 1: Write `useTheme` hook**

Create a new file `src/hooks/useTheme.ts` with the following content:

```typescript
import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'system'
  })

  useEffect(() => {
    const root = window.document.documentElement
    
    const applyTheme = (currentTheme: Theme) => {
      let isDark = false
      if (currentTheme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      } else {
        isDark = currentTheme === 'dark'
      }

      if (isDark) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }

    applyTheme(theme)
    localStorage.setItem('theme', theme)

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = (e: MediaQueryListEvent) => {
        if (e.matches) {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      }
      mediaQuery.addEventListener('change', listener)
      return () => mediaQuery.removeEventListener('change', listener)
    }
  }, [theme])

  return [theme, setThemeState] as const
}
```

- [ ] **Step 2: Commit changes**

```bash
git add src/hooks/useTheme.ts
git commit -m "feat: add useTheme hook for light, dark, and system themes"
```

---

### Task 3: Layout Split Resizing and Header in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Integrate `useTheme` and layout split dragging/collapse state in `src/App.tsx`**

Modify `src/App.tsx` to include resizer handles, panel collapse buttons, a global header bar, and layout width/height persistence:

```tsx
import { useEffect, useState } from 'react'
import { useApp } from './hooks/useApp'
import { useTheme } from './hooks/useTheme'
import { ErrorBanner } from './components/ErrorBanner'
import { Sidebar } from './views/Sidebar'
import { Editor } from './views/Editor'
import { ResultGrid } from './views/ResultGrid'
import { ExportButton } from './views/ExportButton'
import { TabBar } from './views/TabBar'
import { HistoryPanel } from './views/HistoryPanel'

export function App() {
  const app = useApp()
  const [theme, setTheme] = useTheme()
  const { connections: conn, tabs, history } = app
  const active = tabs.active

  // Resizable state
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem('sidebarWidth') || '256'))
  const [historyWidth, setHistoryWidth] = useState(() => Number(localStorage.getItem('historyWidth') || '288'))
  const [editorHeight, setEditorHeight] = useState(() => Number(localStorage.getItem('editorHeight') || '120'))
  
  // Collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')
  const [historyCollapsed, setHistoryCollapsed] = useState(() => localStorage.getItem('historyCollapsed') === 'true')

  // Dragging handler state
  const [activeResizer, setActiveResizer] = useState<'sidebar' | 'history' | 'editor' | null>(null)

  const startResize = (resizer: 'sidebar' | 'history' | 'editor') => (e: React.MouseEvent) => {
    e.preventDefault()
    setActiveResizer(resizer)
  }

  useEffect(() => {
    if (!activeResizer) return

    const handleMouseMove = (e: MouseEvent) => {
      if (activeResizer === 'sidebar') {
        const newWidth = Math.max(150, Math.min(500, e.clientX))
        setSidebarWidth(newWidth)
        localStorage.setItem('sidebarWidth', String(newWidth))
      } else if (activeResizer === 'history') {
        const newWidth = Math.max(150, Math.min(500, window.innerWidth - e.clientX))
        setHistoryWidth(newWidth)
        localStorage.setItem('historyWidth', String(newWidth))
      } else if (activeResizer === 'editor') {
        const mainEl = document.querySelector('main')
        if (mainEl) {
          const rect = mainEl.getBoundingClientRect()
          const newHeight = Math.max(60, Math.min(450, e.clientY - rect.top - 40)) // tabbar is ~40px
          setEditorHeight(newHeight)
          localStorage.setItem('editorHeight', String(newHeight))
        }
      }
    }

    const handleMouseUp = () => {
      setActiveResizer(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [activeResizer])

  if (!conn.online) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500 bg-slate-50 dark:bg-slate-950">
        <p id="offline-msg" className="text-lg">引擎未連線</p>
        <button
          type="button"
          aria-describedby="offline-msg"
          onClick={() => location.reload()}
          className="rounded bg-slate-800 dark:bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors cursor-pointer"
        >
          重試
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-200">
      {/* Global Header */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          {/* Logo SVG */}
          <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="text-blue-600 dark:text-blue-400"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6" y1="6" y2="6"/><line x1="6" x2="6" y1="18" y2="18"/></svg>
            <span>dbcli</span>
          </div>
          <span className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
          {/* Connection Status */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono">{conn.activeConnectionId || '未連線'}</span>
          </div>
        </div>

        {/* Global Control Toolbar */}
        <div className="flex items-center gap-3">
          {/* Panel Toggle Triggers */}
          <div className="flex items-center gap-1 border-r border-slate-200 pr-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                const next = !sidebarCollapsed
                setSidebarCollapsed(next)
                localStorage.setItem('sidebarCollapsed', String(next))
              }}
              className={`rounded p-1.5 transition-colors cursor-pointer ${!sidebarCollapsed ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              title="切換側邊欄"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v16"/></svg>
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !historyCollapsed
                setHistoryCollapsed(next)
                localStorage.setItem('historyCollapsed', String(next))
              }}
              className={`rounded p-1.5 transition-colors cursor-pointer ${!historyCollapsed ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              title="切換歷史紀錄"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v16"/></svg>
            </button>
          </div>

          {/* Theme switcher (Light / Dark / System) */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`rounded px-2 py-1 text-xs transition-colors flex items-center justify-center cursor-pointer ${theme === 'light' ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title="淺色模式"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`rounded px-2 py-1 text-xs transition-colors flex items-center justify-center cursor-pointer ${theme === 'dark' ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title="深色模式"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            </button>
            <button
              type="button"
              onClick={() => setTheme('system')}
              className={`rounded px-2 py-1 text-xs transition-colors flex items-center justify-center cursor-pointer ${theme === 'system' ? 'bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title="跟隨系統"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
            </button>
          </div>
        </div>
      </header>

      <ErrorBanner error={conn.error} onDismiss={conn.dismissError} />

      {/* Main split containers */}
      <div className="flex min-h-0 flex-1 relative overflow-hidden">
        {/* Left Sidebar Panel Wrapper */}
        <div 
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth, display: sidebarCollapsed ? 'none' : 'flex' }} 
          className="flex-shrink-0 h-full flex flex-col"
        >
          <Sidebar
            connections={conn.connections}
            activeConnectionId={conn.activeConnectionId}
            tree={conn.tree}
            expandedColumns={conn.expandedColumns}
            onSelectConnection={conn.selectConnection}
            onLoadColumns={conn.loadTableColumns}
            onInsertSelect={(t) => tabs.loadSql(`SELECT * FROM ${t} LIMIT 100`)}
          />
        </div>

        {/* Left Resizer Drag Handle */}
        {!sidebarCollapsed && (
          <div
            onMouseDown={startResize('sidebar')}
            className={`w-1 h-full cursor-col-resize hover:bg-blue-500 dark:hover:bg-blue-500 transition-colors flex-shrink-0 relative z-20 group ${activeResizer === 'sidebar' ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-800'}`}
          >
            {/* Collapse Arrow Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setSidebarCollapsed(true)
                localStorage.setItem('sidebarCollapsed', 'true')
              }}
              className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
              style={{ pointerEvents: 'auto' }}
              title="摺疊側邊欄"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          </div>
        )}

        {/* Center Main Work Space */}
        <main className="flex min-w-0 flex-1 flex-col h-full bg-slate-50 dark:bg-slate-950">
          <TabBar
            sessions={tabs.sessions}
            activeId={tabs.activeId}
            onOpen={tabs.openTab}
            onClose={tabs.closeTab}
            onSetActive={tabs.setActive}
            onRename={tabs.renameTab}
          />
          <ErrorBanner error={active.error} onDismiss={tabs.dismissError} />
          
          {/* Query Editor Container */}
          <div style={{ height: editorHeight }} className="flex flex-col flex-shrink-0 min-h-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2">
            <div className="flex items-center justify-between gap-2 h-full min-h-0">
              <Editor sql={active.sql} loading={active.loading} onChange={tabs.setSql} onRun={tabs.runQuery} />
              <ExportButton hasResult={!!active.result} onExport={app.exportResult} />
            </div>
          </div>

          {/* Vertical Resizer Handle */}
          <div
            onMouseDown={startResize('editor')}
            className={`h-1 w-full cursor-row-resize hover:bg-blue-500 dark:hover:bg-blue-500 transition-colors flex-shrink-0 relative z-20 ${activeResizer === 'editor' ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-800'}`}
          />

          {/* Result Grid Container */}
          <div className="flex-1 min-h-0">
            <ResultGrid
              result={active.result}
              filter={active.resultFilter}
              sortField={active.sortField}
              sortDir={active.sortDir}
              onFilterChange={tabs.setResultFilter}
              onSort={tabs.setSort}
            />
          </div>
        </main>

        {/* Right Resizer Drag Handle */}
        {!historyCollapsed && (
          <div
            onMouseDown={startResize('history')}
            className={`w-1 h-full cursor-col-resize hover:bg-blue-500 dark:hover:bg-blue-500 transition-colors flex-shrink-0 relative z-20 group ${activeResizer === 'history' ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-800'}`}
          >
            {/* Collapse Arrow Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setHistoryCollapsed(true)
                localStorage.setItem('historyCollapsed', 'true')
              }}
              className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
              style={{ pointerEvents: 'auto' }}
              title="摺疊歷史紀錄"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        )}

        {/* Right History Panel Wrapper */}
        <div 
          style={{ width: historyCollapsed ? 0 : historyWidth, display: historyCollapsed ? 'none' : 'flex' }} 
          className="flex-shrink-0 h-full flex flex-col"
        >
          <HistoryPanel
            entries={history.entries}
            now={Date.now()}
            onPick={tabs.loadSql}
            onClear={history.clear}
          />
        </div>
      </div>

      {/* Global Drag Shield overlay to prevent text selection and iframe issues */}
      {activeResizer && (
        <div className={`fixed inset-0 z-50 ${activeResizer === 'editor' ? 'cursor-row-resize' : 'cursor-col-resize'}`} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit changes**

```bash
git add src/App.tsx
git commit -m "feat: implement resizable layout and theme bar in App.tsx"
```

---

### Task 4: Update Sidebar with SVG Icons and Dark Mode

**Files:**
- Modify: `src/views/Sidebar.tsx`

- [ ] **Step 1: Update `src/views/Sidebar.tsx` for layout size, dark mode, and SVG icons**

Modify `src/views/Sidebar.tsx` to align styles with `DESIGN.md` and use the SVG layout. Note that we will remove the fixed sidebar width (`w-64`), as its width is controlled by its wrapper parent `div` in `App.tsx`.

```tsx
import { useState } from 'react'
import { Table2, Eye, Play, Database, KeyRound, Search } from 'lucide-react'
import type { ConnectionSummary, TreeTable, TableColumnDto } from '../api/types'
import { filterTree } from './tree-filter'

export interface SidebarProps {
  connections: ConnectionSummary[]
  activeConnectionId: string | null
  tree: TreeTable[]
  expandedColumns: Record<string, TableColumnDto[]>
  onSelectConnection(id: string): void
  onLoadColumns(table: string): void
  onInsertSelect(table: string): void
}

export function Sidebar(props: SidebarProps) {
  const { connections, activeConnectionId, tree, expandedColumns } = props
  const [tableQuery, setTableQuery] = useState('')
  const visibleTree = filterTree(tree, tableQuery)
  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-sm">
      <section className="border-b border-slate-200 dark:border-slate-800 p-3">
        <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500 tracking-wider">
          <Database className="h-3.5 w-3.5" /> 連線列表
        </h2>
        <ul className="flex flex-col gap-0.5">
          {connections.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => props.onSelectConnection(c.name)}
                className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors cursor-pointer text-xs ${
                  c.name === activeConnectionId 
                    ? 'bg-blue-50 text-blue-600 font-semibold dark:bg-blue-950/40 dark:text-blue-400' 
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span>{c.name}</span>
                {c.isDefault ? (
                  <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[10px] text-slate-400 dark:text-slate-500 font-medium">預設</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="min-h-0 flex-1 overflow-auto p-3">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500 tracking-wider">資料表 / 檢視表</h2>
        <div className="relative mb-3 flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            aria-label="搜尋資料表"
            value={tableQuery}
            onChange={(e) => setTableQuery(e.target.value)}
            placeholder="搜尋資料表…"
            className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 pl-8 pr-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors"
          />
        </div>
        <ul className="flex flex-col gap-0.5">
          {visibleTree.map((t) => {
            const columns = expandedColumns[t.name]
            return (
              <li key={t.name}>
                <div className="group flex items-center gap-1 rounded px-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <button
                    type="button"
                    onClick={() => props.onLoadColumns(t.name)}
                    className="flex flex-1 items-center gap-2 py-1.5 text-left text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    {t.type === 'view' ? <Eye className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> : <Table2 className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />}
                    <span className="truncate font-mono">{t.name}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`查詢 ${t.name}`}
                    onClick={() => props.onInsertSelect(t.name)}
                    className="p-1 opacity-0 hover:text-blue-600 dark:hover:text-blue-400 focus:opacity-100 focus:ring-1 focus:ring-blue-400 group-hover:opacity-100 transition-all cursor-pointer rounded"
                  >
                    <Play className="h-3 w-3" />
                  </button>
                </div>
                {columns ? (
                  <ul className="ml-5 border-l border-slate-200 dark:border-slate-800 pl-2 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col gap-0.5">
                    {columns.map((col) => (
                      <li key={col.name} className="flex items-center gap-1.5 py-0.5">
                        {col.primaryKey ? (
                          <KeyRound className="h-3 w-3 text-amber-500 flex-shrink-0" aria-label="主鍵" />
                        ) : (
                          <span className="w-3" />
                        )}
                        <span className="font-mono text-slate-700 dark:text-slate-300 truncate">{col.name}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">({col.type})</span>
                        {col.primaryKey ? <span className="text-[9px] bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-500 border border-amber-200/50 dark:border-amber-900/50 rounded px-0.5 font-bold">PK</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
          {visibleTree.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-slate-400 dark:text-slate-500">找不到相符的資料表</p>
          )}
        </ul>
      </section>
    </aside>
  )
}
```

- [ ] **Step 2: Commit changes**

```bash
git add src/views/Sidebar.tsx
git commit -m "feat: modernize Sidebar and update to SVG icons"
```

---

### Task 5: Update Editor Panel and Export Button

**Files:**
- Modify: `src/views/Editor.tsx`
- Modify: `src/views/ExportButton.tsx`

- [ ] **Step 1: Modify `src/views/Editor.tsx` to support dark mode and modern aesthetics**

```tsx
import type { KeyboardEvent } from 'react'
import { Play } from 'lucide-react'

export interface EditorProps {
  sql: string
  loading: boolean
  onChange(sql: string): void
  onRun(): void
}

export function Editor({ sql, loading, onChange, onRun }: EditorProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (!loading) onRun()
    }
  }
  return (
    <div className="flex flex-1 items-start gap-2 h-full min-h-0">
      <textarea
        value={sql}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="SQL 查詢"
        spellCheck={false}
        placeholder="SELECT * FROM …   (Cmd/Ctrl+Enter 執行)"
        className="h-full w-full flex-1 resize-none rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 p-2.5 font-mono text-xs focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20 focus:outline-none transition-all"
      />
      <button
        type="button"
        onClick={onRun}
        disabled={loading}
        className="flex items-center gap-1.5 rounded bg-blue-600 dark:bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50 transition-all cursor-pointer shadow-sm hover:shadow hover:scale-[1.02] active:scale-95 flex-shrink-0"
      >
        <Play className="h-3.5 w-3.5 fill-current" /> Run
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Modify `src/views/ExportButton.tsx` to support dark mode**

```tsx
import { useState } from 'react'
import { Download } from 'lucide-react'

export interface ExportButtonProps {
  hasResult: boolean
  onExport(format: 'csv' | 'json'): void
}

export function ExportButton({ hasResult, onExport }: ExportButtonProps) {
  const [format, setFormat] = useState<'csv' | 'json' | ''>('')
  return (
    <label className={`flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 ${!hasResult ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className="sr-only">匯出格式</span>
      <Download className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      <select
        aria-label="匯出格式"
        value={format}
        disabled={!hasResult}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'csv' || v === 'json') {
            onExport(v)
            setFormat('')
          }
        }}
        className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1.5 focus:border-blue-500 focus:outline-none transition-colors disabled:opacity-50 cursor-pointer"
      >
        <option value="" disabled>匯出</option>
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
    </label>
  )
}
```

- [ ] **Step 3: Commit changes**

```bash
git add src/views/Editor.tsx src/views/ExportButton.tsx
git commit -m "feat: modernize Editor view and ExportButton with dark mode compatibility"
```

---

### Task 6: Update ResultGrid with SVG Icons and Hover Highlight

**Files:**
- Modify: `src/views/ResultGrid.tsx`

- [ ] **Step 1: Modify `src/views/ResultGrid.tsx`**

Replace emoji arrows in column sort headers with beautiful inline SVG arrow indicators. Style grid rows and search boxes to match guidelines.

```tsx
import { useMemo, useRef, useState } from 'react'
import type { QueryResultDto } from '../api/types'
import { computeVisibleRange, nextSortDir, sortRows, type SortDir } from './grid-virtual'
import { filterRows } from './row-filter'
import { CellDetailModal } from '../components/CellDetailModal'
import { Search } from 'lucide-react'

const ROW_HEIGHT = 28
const VIEWPORT_HEIGHT = 480
const OVERSCAN = 8

export interface ResultGridProps {
  result: QueryResultDto | null
  filter: string
  sortField: string | null
  sortDir: SortDir
  onFilterChange(filter: string): void
  onSort(field: string, dir: SortDir): void
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function ResultGrid({ result, filter, sortField, sortDir, onFilterChange, onSort }: ResultGridProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const [detail, setDetail] = useState<{ field: string; value: unknown; row: Record<string, unknown> } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => {
    if (!result) return []
    const filtered = filterRows(result.rows, result.fields, filter)
    if (!sortField || !sortDir) return filtered
    return sortRows(filtered, sortField, sortDir)
  }, [result, sortField, sortDir, filter])

  if (!result) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900">
        尚無結果，執行查詢以查看資料
      </div>
    )
  }

  const range = computeVisibleRange({ scrollTop, viewportHeight: VIEWPORT_HEIGHT, rowHeight: ROW_HEIGHT, rowCount: sorted.length, overscan: OVERSCAN })
  const visible = sorted.slice(range.start, range.end)

  const onHeaderClick = (field: string) => {
    const dir = field === sortField ? nextSortDir(sortDir) : 'asc'
    onSort(field, dir)
    setScrollTop(0)
    scrollRef.current?.scrollTo?.({ top: 0 })
  }

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-slate-900 text-xs">
      <div className="border-b border-slate-200 dark:border-slate-800 p-2 bg-slate-50 dark:bg-slate-900/60">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            aria-label="搜尋結果"
            value={filter}
            onChange={(e) => { onFilterChange(e.target.value); setScrollTop(0) }}
            placeholder="搜尋結果…"
            className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto bg-white dark:bg-slate-900"
        style={{ maxHeight: VIEWPORT_HEIGHT }}
      >
        <table className="w-full border-separate border-spacing-0 text-left font-mono">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
            <tr className="border-b border-slate-300 dark:border-slate-700">
              {result.fields.map((f) => (
                <th
                  key={f}
                  onClick={() => onHeaderClick(f)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHeaderClick(f) } }}
                  tabIndex={0}
                  aria-sort={sortField === f ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className="cursor-pointer select-none border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{f}</span>
                    {sortField === f ? (
                      sortDir === 'asc' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" className="text-blue-500 dark:text-blue-400"><path d="m18 15-6-6-6 6"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" className="text-blue-500 dark:text-blue-400"><path d="m6 9 6 6 6-6"/></svg>
                      )
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {range.topPad > 0 ? (<tr style={{ height: range.topPad }}><td colSpan={result.fields.length} /></tr>) : null}
            {visible.map((row, i) => (
              <tr 
                key={range.start + i} 
                style={{ height: ROW_HEIGHT }} 
                className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                {result.fields.map((f) => (
                  <td
                    key={f}
                    data-col={f}
                    onClick={() => setDetail({ field: f, value: row[f], row })}
                    className="cursor-pointer truncate px-3 py-1 text-slate-800 dark:text-slate-350 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 border-b border-slate-100 dark:border-slate-800/40"
                  >
                    {renderCell(row[f])}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={result.fields.length} className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                  查詢傳回 0 筆資料
                </td>
              </tr>
            ) : null}
            {range.bottomPad > 0 ? (<tr style={{ height: range.bottomPad }}><td colSpan={result.fields.length} /></tr>) : null}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-slate-200 dark:border-slate-800 px-3 py-2 bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 flex justify-between items-center">
        <span>共 {result.rowCount} 列</span>
        {result.ms !== null ? (
          <span className="font-mono text-[10px]">{result.ms} ms</span>
        ) : null}
      </footer>
      {detail ? (
        <CellDetailModal field={detail.field} value={detail.value} row={detail.row} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Commit changes**

```bash
git add src/views/ResultGrid.tsx
git commit -m "feat: modernize ResultGrid and replace sort emojis with SVGs"
```

---

### Task 7: Update TabBar and HistoryPanel

**Files:**
- Modify: `src/views/TabBar.tsx`
- Modify: `src/views/HistoryPanel.tsx`

- [ ] **Step 1: Modify `src/views/TabBar.tsx`**

Make tabs sleek with smooth active borders and hover transitions.

```tsx
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
```

- [ ] **Step 2: Modify `src/views/HistoryPanel.tsx`**

Note: We remove the hardcoded width `w-72` in `HistoryPanel.tsx` since its parent container handles sizing.

```tsx
import { History, Trash2 } from 'lucide-react'
import { relativeTime, type HistoryEntry } from '../hooks/useHistory'

export interface HistoryPanelProps {
  entries: HistoryEntry[]
  now: number
  onPick(sql: string): void
  onClear(): void
}

export function HistoryPanel({ entries, now, onPick, onClear }: HistoryPanelProps) {
  return (
    <aside aria-label="查詢歷史" className="flex h-full w-full flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-sm">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500 tracking-wider">
          <History className="h-3.5 w-3.5" /> 查詢歷史
        </h2>
        <button 
          type="button" 
          aria-label="清除歷史" 
          onClick={onClear} 
          className="rounded p-1 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" 
          disabled={entries.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {entries.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400 dark:text-slate-500">尚無查詢歷史</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map((e) => (
              <li key={`${e.connectionId}:${e.ts}`}>
                <button
                  type="button"
                  onClick={() => onPick(e.sql)}
                  className="flex w-full flex-col gap-1 rounded-md p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-800"
                >
                  <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-350">{e.sql}</span>
                  <span className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                    <span className="font-mono">{e.connectionId ?? '—'}</span>
                    <span>·</span>
                    <span>{e.rowCount} 列</span>
                    <span>·</span>
                    <span>{relativeTime(e.ts, now)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Commit changes**

```bash
git add src/views/TabBar.tsx src/views/HistoryPanel.tsx
git commit -m "feat: modernize TabBar and HistoryPanel views with dark mode support"
```

---

### Task 8: Update CellDetailModal and ErrorBanner

**Files:**
- Modify: `src/components/CellDetailModal.tsx`
- Modify: `src/components/ErrorBanner.tsx`

- [ ] **Step 1: Modify `src/components/CellDetailModal.tsx` for backdrop blur and dark mode**

```tsx
import { useEffect } from 'react'
import { X, Copy } from 'lucide-react'

export interface CellDetailModalProps {
  field: string
  value: unknown
  row: Record<string, unknown>
  onClose(): void
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

export function CellDetailModal({ field, value, row, onClose }: CellDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const formatted = formatValue(value)
  const copy = (text: string) => { void navigator.clipboard?.writeText(text) }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${field} 內容`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-all"
      onClick={onClose}
    >
      <div 
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/40">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{field}</span>
          <button 
            type="button" 
            aria-label="關閉" 
            onClick={onClose} 
            className="rounded-full p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-xs text-slate-800 dark:text-slate-300">{formatted}</pre>
        <footer className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/40">
          <button 
            type="button" 
            onClick={() => copy(formatted)} 
            className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" /> 複製值
          </button>
          <button 
            type="button" 
            onClick={() => copy(JSON.stringify(row))} 
            className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" /> 複製整列
          </button>
        </footer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Modify `src/components/ErrorBanner.tsx` for dark mode**

```tsx
import { X } from 'lucide-react'
import type { ApiError } from '../api/client'

const FRIENDLY: Record<string, string> = {
  BLACKLISTED: '此表受保護，無法存取',
  PERMISSION: '唯讀模式，不允許寫入語句',
  NOT_OPEN: '連線未開啟，正在重新連線…',
  CONNECTION: '資料庫連線失敗',
  BAD_REQUEST: '請求格式錯誤',
  UNAUTHORIZED: '連線授權失敗',
  NOT_CONFIGURED: '尚未設定資料庫連線',
}

export function ErrorBanner({ error, onDismiss }: { error: ApiError | null; onDismiss: () => void }) {
  if (!error) return null
  const friendly = FRIENDLY[error.code]
  if (!friendly) console.error('[dbcli] unexpected error:', error.code, error.message)
  return (
    <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 dark:border-red-950/40 dark:bg-red-950/20 px-4 py-2.5 text-xs text-red-800 dark:text-red-400">
      <span className="font-medium">{friendly ?? '發生未預期錯誤'}</span>
      <button 
        type="button" 
        aria-label="關閉" 
        onClick={onDismiss} 
        className="rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Commit changes**

```bash
git add src/components/CellDetailModal.tsx src/components/ErrorBanner.tsx
git commit -m "feat: design cell detail modal with glassmorphism backdrop and support error banner dark mode"
```

---

### Task 9: Verify and Run Application

**Files:**
- Test: Run validation commands

- [ ] **Step 1: Run typecheck to verify there are no TypeScript compile errors**

Run: `tsc --noEmit`
Expected: Success with no output errors.

- [ ] **Step 2: Start dev server to verify build processes**

Run: `bun run dev`
Expected: Server starts successfully, Tailwind CSS v4 builds correctly without errors.
