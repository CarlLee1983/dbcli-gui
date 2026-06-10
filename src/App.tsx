import { useEffect, useMemo, useState } from 'react'
import { useApp } from './hooks/useApp'
import { useTheme } from './hooks/useTheme'
import { ErrorBanner } from './components/ErrorBanner'
import { Sidebar } from './views/Sidebar'
import { Editor } from './views/Editor'
import { ResultGrid } from './views/ResultGrid'
import { TabBar } from './views/TabBar'
import { HistoryPanel } from './views/HistoryPanel'
import { ConnectionFormModal } from './components/ConnectionFormModal'
import { TableBrowser } from './views/TableBrowser'
import { WorkspaceSwitcher } from './views/WorkspaceSwitcher'
import { detectSingleTable } from './hooks/single-table'
import type { ConnectionDetail } from './api/types'

export function App() {
  const app = useApp()
  const [theme, setTheme] = useTheme()
  const { connections: conn, tabs, history, workspaces } = app
  const active = tabs.active
  // The single-table editability affordance is gated on the executed SQL (not live text).
  const editableTable = useMemo(
    () => (active.result ? detectSingleTable(active.executedSql) : null),
    [active.result, active.executedSql],
  )

  // Resizable state
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem('sidebarWidth') || '256'))
  const [historyWidth, setHistoryWidth] = useState(() => Number(localStorage.getItem('historyWidth') || '288'))
  const [editorHeight, setEditorHeight] = useState(() => Number(localStorage.getItem('editorHeight') || '120'))
  
  // Collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')
  const [historyCollapsed, setHistoryCollapsed] = useState(() => localStorage.getItem('historyCollapsed') === 'true')

  // Connection modal state
  const [connModal, setConnModal] = useState<{ mode: 'create' | 'edit'; initial?: ConnectionDetail } | null>(null)

  const openEdit = async (name: string) => {
    try { setConnModal({ mode: 'edit', initial: await conn.getConnection(name) }) }
    catch { /* 錯誤已進 error channel */ }
  }
  const removeConn = async (name: string) => {
    if (!window.confirm(`確定刪除連線「${name}」?`)) return
    await conn.deleteConnection(name).catch(() => {})
  }

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
          <span className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
          <WorkspaceSwitcher
            workspaces={workspaces.workspaces}
            activeId={workspaces.activeId}
            onSelect={app.switchWorkspace}
            onAdd={workspaces.add}
            onRemove={app.removeWorkspace}
          />
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
            onAddConnection={() => setConnModal({ mode: 'create' })}
            onEditConnection={openEdit}
            onDeleteConnection={removeConn}
            onBrowseTable={app.browseTable}
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

          {active.browse ? (
            <div className="flex-1 min-h-0">
              <TableBrowser
                table={active.browse.table}
                schema={active.browse.schema}
                rows={active.browse.rows}
                columns={active.browse.fields}
                permission={conn.permission ?? 'query-only'}
                saving={app.saving}
                onSave={(ops) => app.saveTableEdits(active.browse!.table, ops)}
              />
            </div>
          ) : (
            <>
              {/* Query Editor Container */}
              <div style={{ height: editorHeight }} className="flex flex-col flex-shrink-0 min-h-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4">
                <Editor
                  sql={active.sql}
                  loading={active.loading}
                  hasResult={!!active.result}
                  onChange={tabs.setSql}
                  onRun={tabs.runQuery}
                  onExport={app.exportResult}
                />
              </div>

              {/* Vertical Resizer Handle */}
              <div
                onMouseDown={startResize('editor')}
                className={`h-1 w-full cursor-row-resize hover:bg-blue-500 dark:hover:bg-blue-500 transition-colors flex-shrink-0 relative z-20 ${activeResizer === 'editor' ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-800'}`}
              />

              {/* Single-table SELECT results can be opened for editing (stage two).
                  Detect against the executed SQL so retyping the editor without re-running
                  cannot retarget editing to a different table. */}
              {editableTable ? (
                <div className="flex items-center justify-end gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5">
                  <span className="text-xs text-slate-400 dark:text-slate-500">偵測到單表查詢</span>
                  <button
                    type="button"
                    onClick={() => app.editQueryResult()}
                    className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500 transition-colors cursor-pointer"
                  >
                    編輯此結果
                  </button>
                </div>
              ) : null}

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
            </>
          )}
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

      {/* Connection Form Modal */}
      {connModal && (
        <ConnectionFormModal
          mode={connModal.mode}
          initial={connModal.initial}
          onSubmit={connModal.mode === 'create' ? conn.createConnection : conn.updateConnection}
          onTest={conn.testConnection}
          onClose={() => setConnModal(null)}
        />
      )}
    </div>
  )
}
