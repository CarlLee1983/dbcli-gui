import { useApp } from './hooks/useApp'
import { ErrorBanner } from './components/ErrorBanner'
import { Sidebar } from './views/Sidebar'
import { Editor } from './views/Editor'
import { ResultGrid } from './views/ResultGrid'
import { ExportButton } from './views/ExportButton'
import { TabBar } from './views/TabBar'
import { HistoryPanel } from './views/HistoryPanel'

export function App() {
  const app = useApp()
  const { connections: conn, tabs, history } = app
  const active = tabs.active

  if (!conn.online) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-600">
        <p id="offline-msg" className="text-lg">引擎未連線</p>
        <button
          type="button"
          aria-describedby="offline-msg"
          onClick={() => location.reload()}
          className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700"
        >
          重試
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ErrorBanner error={conn.error} onDismiss={conn.dismissError} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          connections={conn.connections}
          activeConnectionId={conn.activeConnectionId}
          tree={conn.tree}
          expandedColumns={conn.expandedColumns}
          onSelectConnection={conn.selectConnection}
          onLoadColumns={conn.loadTableColumns}
          onInsertSelect={(t) => tabs.loadSql(`SELECT * FROM ${t} LIMIT 100`)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar
            sessions={tabs.sessions}
            activeId={tabs.activeId}
            onOpen={tabs.openTab}
            onClose={tabs.closeTab}
            onSetActive={tabs.setActive}
            onRename={tabs.renameTab}
          />
          <ErrorBanner error={active.error} onDismiss={tabs.dismissError} />
          <div className="flex items-center justify-between border-b border-gray-200 p-2">
            <Editor sql={active.sql} loading={active.loading} onChange={tabs.setSql} onRun={tabs.runQuery} />
            <ExportButton hasResult={!!active.result} onExport={app.exportResult} />
          </div>
          <ResultGrid
            result={active.result}
            filter={active.resultFilter}
            sortField={active.sortField}
            sortDir={active.sortDir}
            onFilterChange={tabs.setResultFilter}
            onSort={tabs.setSort}
          />
        </main>
        <HistoryPanel
          entries={history.entries}
          now={Date.now()}
          onPick={tabs.loadSql}
          onClear={history.clear}
        />
      </div>
    </div>
  )
}
