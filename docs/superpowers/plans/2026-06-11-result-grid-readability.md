# Result Grid Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve arbitrary SQL query result readability by adding row numbers, clearer result counts, distinct empty/filter states, and typed cell rendering for special values.

**Architecture:** Keep the change local to `ResultGrid` and its frontend tests. `ResultGrid` will add small local rendering helpers, preserve existing controlled filter/sort props, and keep virtual scrolling based on fixed row height. No backend API, shared DTO, or `TableBrowser` changes are part of this plan.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 utility classes, lucide-react, Bun test, Testing Library.

---

## File Structure

- Modify: `src/views/ResultGrid.tsx`
  - Responsibility: render arbitrary SQL query results, local filtering/sorting, virtualized rows, search input, result summary, typed cell display, and cell detail modal trigger.
  - Keep helpers local to this file because the spec explicitly excludes extracting a shared DataGrid or touching `TableBrowser`.
- Modify: `tests/frontend/ResultGrid.test.tsx`
  - Responsibility: lock ResultGrid behavior and prevent regressions in search, sort, virtualization, cell detail, result summaries, empty states, row numbers, and typed rendering.
- No files created for shared components or styles.
- No sidecar/API files touched.

## Implementation Notes

- Keep `ROW_HEIGHT = 28`, `VIEWPORT_HEIGHT = 480`, and `OVERSCAN = 8`.
- Use `result.rows.length` for the unfiltered in-memory total in the UI summary, not `result.rowCount`, because `result.rowCount` may represent server-reported total while `filterRows` operates on the rows present in this result payload.
- Preserve existing footer compatibility: tests that find text containing `列` and `ms` should still pass.
- The row number column is visual context only. It must not set `data-col`, must not call `setDetail`, and must not be sortable.
- Use ASCII in source code comments and identifiers. Chinese UI strings are already used in this project and are acceptable for display text.

---

### Task 1: Lock Result Summary, Row Number, and Empty-State Behavior

**Files:**
- Modify: `tests/frontend/ResultGrid.test.tsx`
- Test: `tests/frontend/ResultGrid.test.tsx`

- [ ] **Step 1: Add failing tests for row numbers, filtered counts, and filter empty state**

Append these tests after the existing `footer shows rowCount and ms` test:

```tsx
test('renders a non-interactive row number column', () => {
  render(<ResultGrid result={small} filter="" sortField={null} sortDir={null} onFilterChange={noop} onSort={noop} />)
  expect(screen.getByRole('columnheader', { name: '#' })).toBeDefined()
  expect(screen.getByLabelText('第 1 列')).toBeDefined()
  expect(screen.getByLabelText('第 2 列')).toBeDefined()
})

test('shows filtered and total row counts when a filter is active', () => {
  render(
    <ResultGrid
      result={{ rows: [{ id: 1, label: 'apple' }, { id: 2, label: 'banana' }], fields: ['id', 'label'], rowCount: 2, ms: 1 }}
      filter="app"
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={() => {}}
    />,
  )
  expect(screen.getAllByText('顯示 1 / 共 2 列').length).toBeGreaterThan(0)
})
```

Append these tests after the existing `applies the controlled filter to rows` test:

```tsx
test('distinguishes filter-empty results from query-empty results', () => {
  render(
    <ResultGrid
      result={{ rows: [{ id: 1, label: 'apple' }], fields: ['id', 'label'], rowCount: 1, ms: 1 }}
      filter="missing"
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={() => {}}
    />,
  )
  expect(screen.getByText('沒有符合「missing」的資料')).toBeDefined()
  expect(screen.queryByText('查詢傳回 0 筆資料')).toBeNull()
})

test('shows the query-empty message when the result has no rows before filtering', () => {
  render(
    <ResultGrid
      result={{ rows: [], fields: ['id'], rowCount: 0, ms: 1 }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={() => {}}
      onSort={() => {}}
    />,
  )
  expect(screen.getByText('查詢傳回 0 筆資料')).toBeDefined()
})
```

- [ ] **Step 2: Run the focused test file and verify the new tests fail**

Run:

```bash
bun test tests/frontend/ResultGrid.test.tsx
```

Expected: FAIL. The output should include missing text or role failures for `#`, `顯示 1 / 共 2 列`, and `沒有符合「missing」的資料`.

- [ ] **Step 3: Implement result summary, row number column, and distinct empty states**

Modify `src/views/ResultGrid.tsx`.

Replace the current `const range...` block with this version:

```tsx
  const totalRows = result.rows.length
  const visibleRows = sorted.length
  const hasFilter = filter.trim().length > 0
  const resultSummary = hasFilter ? `顯示 ${visibleRows} / 共 ${totalRows} 列` : `共 ${totalRows} 列`
  const tableColSpan = result.fields.length + 1
  const range = computeVisibleRange({ scrollTop, viewportHeight: VIEWPORT_HEIGHT, rowHeight: ROW_HEIGHT, rowCount: visibleRows, overscan: OVERSCAN })
  const visible = sorted.slice(range.start, range.end)
```

Replace the search toolbar JSX with this version:

```tsx
      <div className="border-b border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="search"
              aria-label="搜尋結果"
              value={filter}
              onChange={(e) => { onFilterChange(e.target.value); setScrollTop(0) }}
              placeholder="搜尋結果..."
              className="w-full rounded border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-800 transition-colors focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>
          <div className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {resultSummary}
          </div>
        </div>
      </div>
```

Inside `<thead>`, add the row-number header before `result.fields.map`:

```tsx
              <th
                scope="col"
                className="sticky left-0 z-20 w-12 select-none border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-right font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              >
                #
              </th>
```

In the table body, replace every `colSpan={result.fields.length}` with:

```tsx
colSpan={tableColSpan}
```

Inside the visible row `<tr>`, add this row-number `<td>` before `result.fields.map`:

```tsx
                <td aria-label={`第 ${range.start + i + 1} 列`} className="sticky left-0 z-10 w-12 border-b border-r border-slate-100 bg-slate-50 px-2 py-1 text-right font-mono text-[11px] tabular-nums text-slate-400 dark:border-slate-800/60 dark:bg-slate-900 dark:text-slate-500">
                  {range.start + i + 1}
                </td>
```

Replace the existing empty-state row block with this version:

```tsx
            {visibleRows === 0 ? (
              <tr>
                <td colSpan={tableColSpan} className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                  {hasFilter && totalRows > 0 ? `沒有符合「${filter}」的資料` : '查詢傳回 0 筆資料'}
                </td>
              </tr>
            ) : null}
```

Replace the footer summary text:

```tsx
        <span>{resultSummary}</span>
```

Keep the elapsed time block unchanged:

```tsx
        {result.ms !== null ? (
          <span className="font-mono text-[10px]">{result.ms} ms</span>
        ) : null}
```

- [ ] **Step 4: Run the focused test file and verify Task 1 passes**

Run:

```bash
bun test tests/frontend/ResultGrid.test.tsx
```

Expected: PASS for all existing tests plus the new Task 1 tests.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/views/ResultGrid.tsx tests/frontend/ResultGrid.test.tsx
git commit -m "Make query result position and filter state explicit" \
  -m "Constraint: ResultGrid must preserve existing search, sort, virtualization, and cell detail behavior while improving readability." \
  -m "Rejected: Changing QueryResultDto or sidecar query responses | the UI can derive this state from existing rows and filter props." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep the row-number column non-interactive and local to query results unless a later shared-grid spec expands it." \
  -m "Tested: bun test tests/frontend/ResultGrid.test.tsx" \
  -m "Not-tested: Full app build and e2e suite."
```

Expected: Commit succeeds with only `src/views/ResultGrid.tsx` and `tests/frontend/ResultGrid.test.tsx` staged.

---

### Task 2: Lock Typed Cell Rendering

**Files:**
- Modify: `tests/frontend/ResultGrid.test.tsx`
- Test: `tests/frontend/ResultGrid.test.tsx`

- [ ] **Step 1: Add failing tests for special values and object previews**

Append these tests after the existing `renders cell values` test:

```tsx
test('distinguishes null, empty string, boolean, and object values', () => {
  render(
    <ResultGrid
      result={{
        fields: ['nil', 'empty', 'enabled', 'meta'],
        rows: [{ nil: null, empty: '', enabled: false, meta: { plan: 'pro' } }],
        rowCount: 1,
        ms: 1,
      }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={noop}
      onSort={noop}
    />,
  )
  expect(screen.getByText('NULL')).toBeDefined()
  expect(screen.getByText('empty')).toBeDefined()
  expect(screen.getByText('false')).toBeDefined()
  expect(screen.getByText('{"plan":"pro"}')).toBeDefined()
})

test('right-aligns numeric cells for easier comparison', () => {
  render(
    <ResultGrid
      result={{ fields: ['amount'], rows: [{ amount: 1234.5 }], rowCount: 1, ms: 1 }}
      filter=""
      sortField={null}
      sortDir={null}
      onFilterChange={noop}
      onSort={noop}
    />,
  )
  const cell = screen.getByText('1234.5').closest('td')
  expect(cell?.className).toContain('text-right')
  expect(cell?.className).toContain('tabular-nums')
})
```

- [ ] **Step 2: Run the focused test file and verify the new tests fail**

Run:

```bash
bun test tests/frontend/ResultGrid.test.tsx
```

Expected: FAIL. The output should show that `NULL`, `empty`, or typed numeric classes are not present.

- [ ] **Step 3: Implement local typed cell helpers**

Modify `src/views/ResultGrid.tsx`.

Replace the existing `renderCell` helper with these helpers:

```tsx
function previewValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function cellTone(value: unknown): string {
  if (value === null || value === undefined) {
    return 'text-slate-500 dark:text-slate-400'
  }
  if (value === '') {
    return 'text-slate-500 dark:text-slate-400'
  }
  if (typeof value === 'number') {
    return 'text-right tabular-nums text-slate-900 dark:text-slate-100'
  }
  if (typeof value === 'boolean') {
    return 'text-slate-700 dark:text-slate-200'
  }
  if (typeof value === 'object') {
    return 'text-indigo-700 dark:text-indigo-300'
  }
  return 'text-slate-800 dark:text-slate-300'
}

function renderCellContent(value: unknown) {
  if (value === null || value === undefined) {
    return (
      <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-normal text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        NULL
      </span>
    )
  }
  if (value === '') {
    return (
      <span className="inline-flex rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        empty
      </span>
    )
  }
  if (typeof value === 'boolean') {
    return (
      <span className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] ${value ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
        {String(value)}
      </span>
    )
  }
  return previewValue(value)
}
```

- [ ] **Step 4: Use typed helpers in data cells**

In the `result.fields.map` data cell, replace the `<td>` class and contents with this version:

```tsx
                  <td
                    key={f}
                    data-col={f}
                    onClick={() => setDetail({ field: f, value: row[f], row })}
                    className={`cursor-pointer truncate border-b border-slate-100 px-3 py-1 hover:bg-blue-50/50 dark:border-slate-800/40 dark:hover:bg-blue-950/20 ${cellTone(row[f])}`}
                  >
                    {renderCellContent(row[f])}
                  </td>
```

- [ ] **Step 5: Run the focused test file and verify Task 2 passes**

Run:

```bash
bun test tests/frontend/ResultGrid.test.tsx
```

Expected: PASS for all ResultGrid tests.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/views/ResultGrid.tsx tests/frontend/ResultGrid.test.tsx
git commit -m "Distinguish special values in query result cells" \
  -m "Constraint: Typed rendering must be derived only from JavaScript values already present in QueryResultDto rows." \
  -m "Rejected: Inferring database schema types in the grid | the result payload does not carry reliable schema metadata for arbitrary SQL." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Keep badges text-readable so value meaning never depends on color alone." \
  -m "Tested: bun test tests/frontend/ResultGrid.test.tsx" \
  -m "Not-tested: Full app build and e2e suite."
```

Expected: Commit succeeds with only `src/views/ResultGrid.tsx` and `tests/frontend/ResultGrid.test.tsx` staged.

---

### Task 3: Refine Visual Hierarchy and Run Final Verification

**Files:**
- Modify: `src/views/ResultGrid.tsx`
- Test: `tests/frontend/ResultGrid.test.tsx`

- [ ] **Step 1: Strengthen table header, zebra rows, and hover hierarchy**

Modify `src/views/ResultGrid.tsx`.

Use this table element class:

```tsx
        <table className="w-full border-separate border-spacing-0 text-left font-mono">
```

Use this `<thead>` class:

```tsx
          <thead className="sticky top-0 z-30 bg-slate-100 shadow-[0_1px_0_rgba(148,163,184,0.35)] dark:bg-slate-800 dark:shadow-[0_1px_0_rgba(51,65,85,0.9)]">
```

Use this sortable data-header `<th>` class:

```tsx
                  className="cursor-pointer select-none border-b border-r border-slate-200 bg-slate-100 px-3 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-200/70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/70"
```

Use this visible row `<tr>` class:

```tsx
                className="group border-b border-slate-100 odd:bg-white even:bg-slate-50/60 hover:bg-blue-50/70 dark:border-slate-800/50 dark:odd:bg-slate-900 dark:even:bg-slate-900/55 dark:hover:bg-blue-950/20"
```

Use this row-number `<td>` class:

```tsx
                <td aria-label={`第 ${range.start + i + 1} 列`} className="sticky left-0 z-10 w-12 border-b border-r border-slate-100 bg-inherit px-2 py-1 text-right font-mono text-[11px] tabular-nums text-slate-400 group-hover:bg-blue-50/70 dark:border-slate-800/60 dark:text-slate-500 dark:group-hover:bg-blue-950/20">
                  {range.start + i + 1}
                </td>
```

Keep data cell `hover:bg-blue-50/50 dark:hover:bg-blue-950/20` from Task 2.

- [ ] **Step 2: Run the focused test file**

Run:

```bash
bun test tests/frontend/ResultGrid.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full frontend and build verification**

Run:

```bash
bun test tests/frontend/ResultGrid.test.tsx tests/frontend/table-subtabs.test.tsx tests/frontend/Editor.test.tsx
bun run build
```

Expected:
- The targeted frontend tests pass.
- `bun run build` exits with code 0.

- [ ] **Step 4: Inspect the final diff for scope**

Run:

```bash
git diff -- src/views/ResultGrid.tsx tests/frontend/ResultGrid.test.tsx
git status --short
```

Expected:
- Diff only includes `src/views/ResultGrid.tsx` and `tests/frontend/ResultGrid.test.tsx`.
- Existing untracked `.claude/` may still appear and must remain untouched.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add src/views/ResultGrid.tsx tests/frontend/ResultGrid.test.tsx
git commit -m "Tune query result grid visual hierarchy" \
  -m "Constraint: The result grid must remain dense and fixed-height for virtual scrolling correctness." \
  -m "Rejected: Card-style result rendering or larger rows | those reduce scan density for database query workflows." \
  -m "Confidence: high" \
  -m "Scope-risk: narrow" \
  -m "Directive: Preserve fixed ROW_HEIGHT unless virtual range calculation is changed and tested together." \
  -m "Tested: bun test tests/frontend/ResultGrid.test.tsx tests/frontend/table-subtabs.test.tsx tests/frontend/Editor.test.tsx; bun run build" \
  -m "Not-tested: Playwright e2e suite."
```

Expected: Commit succeeds with only `src/views/ResultGrid.tsx` and `tests/frontend/ResultGrid.test.tsx` staged.

---

## Final Verification Checklist

- [ ] Run:

```bash
bun test tests/frontend/ResultGrid.test.tsx
bun run build
git status --short
```

- [ ] Confirm:
  - `ResultGrid` shows row numbers.
  - `ResultGrid` distinguishes `NULL`, empty strings, booleans, numbers, and object previews.
  - Filtered results show `顯示 F / 共 N 列`.
  - Filter-empty results and query-empty results use different messages.
  - Clicking a data cell still opens `CellDetailModal`.
  - Large results still render a virtualized window rather than every row.
  - No files outside `src/views/ResultGrid.tsx` and `tests/frontend/ResultGrid.test.tsx` changed for implementation.

## Spec Coverage Review

- Scope limited to `ResultGrid`: covered by File Structure and all tasks.
- Existing search/sort/virtualization/detail behavior preserved: covered by existing tests, Task 1, Task 2, and final verification.
- Row number column: covered by Task 1.
- Result summary and distinct empty states: covered by Task 1.
- Typed rendering for null, empty string, boolean, number, and object: covered by Task 2.
- Visual hierarchy for sticky header, zebra rows, and hover: covered by Task 3.
- No backend/API/TableBrowser changes: covered by File Structure, Implementation Notes, and final scope diff check.
