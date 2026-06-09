import { useSidecar } from './hooks/useSidecar'
import { ErrorBanner } from './components/ErrorBanner'
import { Sidebar } from './views/Sidebar'
import { Editor } from './views/Editor'
import { ResultGrid } from './views/ResultGrid'
import { ExportButton } from './views/ExportButton'
import { HistoryPanel } from './views/HistoryPanel'

export function App() {
  const s = useSidecar()

  if (!s.online) {
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
      <ErrorBanner error={s.error} onDismiss={s.dismissError} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          connections={s.connections}
          activeConnectionId={s.activeConnectionId}
          tree={s.tree}
          expandedColumns={s.expandedColumns}
          onSelectConnection={s.selectConnection}
          onLoadColumns={s.loadTableColumns}
          onInsertSelect={s.insertSelect}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-gray-200 p-2">
            <Editor sql={s.sql} loading={s.loading} onChange={s.setSql} onRun={s.runQuery} />
            <ExportButton hasResult={!!s.result} onExport={s.exportResult} />
          </div>
          <ResultGrid result={s.result} />
        </main>
        <HistoryPanel
          entries={s.history.entries}
          now={Date.now()}
          onPick={s.loadFromHistory}
          onClear={s.history.clear}
        />
      </div>
    </div>
  )
}
