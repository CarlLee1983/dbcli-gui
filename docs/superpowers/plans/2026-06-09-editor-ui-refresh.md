# Editor UI Refresh (Modern Bold) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the editor UI with a "Modern Bold" aesthetic, featuring a vertical sidebar for actions and polished SVG icons.

**Architecture:** 
- Vertical toolbar layout in `Editor.tsx` using flexbox.
- Polished `ExportButton` component with SVG icon and custom dropdown styling.
- Consistent spacing and alignment in the main `App.tsx` container.

**Tech Stack:** React 19, Tailwind CSS 4, Lucide React.

---

### Task 1: Polished Export Button

**Files:**
- Modify: `src/views/ExportButton.tsx`

- [ ] **Step 1: Refactor ExportButton to match Modern Bold style**
Update the component to use a more button-like container with a polished SVG icon and dropdown.

```tsx
// src/views/ExportButton.tsx
import { useState } from 'react'
import { Download, ChevronDown } from 'lucide-react'

export interface ExportButtonProps {
  hasResult: boolean
  onExport(format: 'csv' | 'json'): void
}

export function ExportButton({ hasResult, onExport }: ExportButtonProps) {
  const [format, setFormat] = useState<'csv' | 'json' | ''>('')
  
  const containerStyle = `
    flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 
    bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 
    px-3 h-10 transition-all hover:bg-slate-50 dark:hover:bg-slate-700/50
    ${!hasResult ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
  `

  return (
    <div className="relative">
      <div className={containerStyle}>
        <Download className="h-4 w-4" />
        <span className="text-xs font-medium">匯出</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
        <select
          aria-label="匯出格式"
          value={format}
          disabled={!hasResult}
          onChange={(e) => {
            const v = e.target.value as 'csv' | 'json'
            if (v) {
              onExport(v)
              setFormat('')
            }
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        >
          <option value="" disabled>選擇格式</option>
          <option value="csv">CSV 檔案</option>
          <option value="json">JSON 檔案</option>
        </select>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify component renders correctly**
Run: `bun test tests/frontend/ExportButton.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add src/views/ExportButton.tsx
git commit -m "style: polish ExportButton with Modern Bold aesthetic"
```

---

### Task 2: Vertical Editor Toolbar

**Files:**
- Modify: `src/views/Editor.tsx`

- [ ] **Step 1: Refactor Editor layout to include vertical toolbar**
Move the Run button into a dedicated sidebar container and update styling.

```tsx
// src/views/Editor.tsx
import type { KeyboardEvent } from 'react'
import { Play } from 'lucide-react'
import { ExportButton } from './ExportButton'

export interface EditorProps {
  sql: string
  loading: boolean
  onChange(sql: string): void
  onRun(): void
  hasResult: boolean
  onExport(format: 'csv' | 'json'): void
}

export function Editor({ sql, loading, onChange, onRun, hasResult, onExport }: EditorProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (!loading) onRun()
    }
  }

  const textareaClass = `
    h-full w-full flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-800 
    bg-slate-50/50 dark:bg-slate-950/50 text-slate-800 dark:text-slate-200 
    p-4 font-mono text-sm leading-relaxed
    focus:border-blue-500 dark:focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 focus:outline-none 
    transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600
  `

  return (
    <div className="flex flex-1 items-stretch gap-4 h-full min-h-0">
      <textarea
        value={sql}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="SQL 查詢"
        spellCheck={false}
        placeholder="在此輸入 SQL 查詢... (Cmd+Enter 執行)"
        className={textareaClass}
      />
      
      {/* Vertical Action Sidebar */}
      <div className="flex flex-col gap-3 w-28 flex-shrink-0">
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="flex items-center justify-center gap-2 h-12 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-500 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
        >
          <Play className="h-4 w-4 fill-current" />
          {loading ? '執行中' : '執行'}
        </button>
        
        <ExportButton hasResult={hasResult} onExport={onExport} />
        
        <div className="mt-auto text-[10px] text-slate-400 dark:text-slate-600 text-center leading-tight">
          快速鍵<br/>⌘ + Enter
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update App.tsx to pass new props to Editor**
The Editor now handles ExportButton directly to maintain the vertical layout.

- [ ] **Step 3: Verify component renders correctly**
Run: `bun test tests/frontend/Editor.test.tsx`
Expected: PASS (Update test props as needed)

- [ ] **Step 4: Commit**
```bash
git add src/views/Editor.tsx src/App.tsx
git commit -m "feat: implement vertical action toolbar for SQL editor"
```

---

### Task 3: Layout Alignment & Polish

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/views/TabBar.tsx`

- [ ] **Step 1: Polish TabBar and App container spacing**
Increase padding and refine border colors to match the "grand" feel.

```tsx
// src/App.tsx container for Editor
<div style={{ height: editorHeight }} className="flex flex-col flex-shrink-0 min-h-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4">
  <Editor 
    sql={active.sql} 
    loading={active.loading} 
    onChange={tabs.setSql} 
    onRun={tabs.runQuery}
    hasResult={!!active.result}
    onExport={app.exportResult}
  />
</div>
```

- [ ] **Step 2: Verify visual consistency**
Check that the editor area feels balanced and the toolbar is correctly aligned.

- [ ] **Step 3: Commit**
```bash
git add src/App.tsx src/views/TabBar.tsx
git commit -m "style: final layout alignment and polish for editor area"
```

---

### Task 4: Final Verification

- [ ] **Step 1: Run all frontend tests**
Run: `bun test tests/frontend/`
Expected: ALL PASS

- [ ] **Step 2: Visual verification in browser**
Use Playwright to capture the final UI state.
