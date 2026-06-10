# dbcli core — DataExecutor 公開匯出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把上游 `@carllee1983/dbcli` 既有的 `DataExecutor`(INSERT/UPDATE/DELETE,方言正確、含權限與 blacklist 守門)及其結果型別,從 `core` 公開 barrel 匯出,並發版 1.31.0,供 dbcli-gui sidecar 重用。

**Architecture:** `DataExecutor`(`src/core/data-executor.ts`)已實作完整且有單元測,但未從 `src/core/public.ts` 匯出。本計畫只做「公開表面擴充 + 版本 bump + build」,不改動 `DataExecutor` 內部邏輯。發布 npm 由維護者本人手動執行(見最後一步)。

**Tech Stack:** TypeScript、Bun(`bun test` / `bun run build`)、zod v3。

**Repo:** `/Users/carl/Dev/CMG/Dbcli`(上游 core,**非** dbcli-gui)。所有指令在此 repo 根目錄執行。

---

### Task 1: 從 public barrel 匯出 DataExecutor 與結果型別

**Files:**
- Modify: `src/core/public.ts`
- Modify: `tests/unit/core/public-exports.test.ts`

- [ ] **Step 1: 先寫會失敗的測試(擴充既有 public-exports 測試)**

在 `tests/unit/core/public-exports.test.ts` 既有 `describe` 區塊後,新增一個 `describe`:

```ts
describe('public core barrel exposes the data-editing surface', () => {
  test('exports DataExecutor class', () => {
    expect(typeof (core as Record<string, unknown>).DataExecutor).toBe('function')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/unit/core/public-exports.test.ts`
Expected: FAIL —「expected 'undefined' to be 'function'」(尚未匯出 `DataExecutor`)。

- [ ] **Step 3: 在 public.ts 加匯出**

在 `src/core/public.ts` 的「Engine」區塊(`export { QueryExecutor } ...` 那行下方)加:

```ts
export { DataExecutor } from '@/core/data-executor'
```

並在檔尾的型別匯出區(`export type { ... }` 附近)加:

```ts
export type { DataExecutionResult, DataExecutionOptions } from '@/types/data'
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/unit/core/public-exports.test.ts`
Expected: PASS。

- [ ] **Step 5: 跑既有 DataExecutor 單元測,確認未破壞**

Run: `bun test tests/unit/core/data-executor.test.ts tests/unit/core/data-executor-blacklist.test.ts`
Expected: PASS(本計畫未改動 `DataExecutor` 內部,應全綠)。

- [ ] **Step 6: Commit**

```bash
git add src/core/public.ts tests/unit/core/public-exports.test.ts
git commit -m "feat: [core] 公開匯出 DataExecutor 與資料執行型別 (data editing surface)"
```

---

### Task 2: 建置與版本 bump(發 1.31.0)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: bump 版本 1.30.0 → 1.31.0**

編輯 `package.json`,把 `"version": "1.30.0"` 改為 `"version": "1.31.0"`。

- [ ] **Step 2: 重建 dist**

Run: `bun run build`
Expected: 成功產生 `dist/`(含 `dist/core.mjs`、`dist/core.d.ts`)。

- [ ] **Step 3: 驗證 build 產物含 DataExecutor**

Run: `grep -c "DataExecutor" dist/core.d.ts`
Expected: 輸出 ≥ 1(`dist/core.d.ts` 內出現 `DataExecutor` 宣告)。

- [ ] **Step 4: 跑全測試套件確認綠**

Run: `bun test`
Expected: ALL PASS(維持既有全綠基線)。

- [ ] **Step 5: Commit(只提交版本 bump;dist 不入 git)**

> `dist/` 在 `.gitignore`、不被追蹤;`npm publish` 會由 `prepublishOnly: bun run build` 自動重建,`files` 欄位再打包 `dist/`。故 commit 只含 `package.json`,本地 build 出的 `dist/` 留在磁碟供開發用即可。

```bash
git add package.json
git commit -m "build: [core] bump 版本 1.31.0 (dist 由 prepublishOnly 於發布時重建)"
```

---

### Task 3: 發布 npm(維護者手動,**勿自動執行**)

> ⚠️ **此步驟由使用者本人執行,AI 不得自動 `npm publish`。** 見記憶 `user-handles-npm-publish`。

- [ ] **Step 1: 由維護者確認並發布**

```bash
# 由使用者本人執行:
npm publish
```

- [ ] **Step 2: 確認發布成功**

Run: `npm view @carllee1983/dbcli version`
Expected: `1.31.0`。

> dbcli-gui 計畫的階段 B 第一步會 `bun install` 拉取 1.31.0 後才開始;在發布完成前,gui 可先用 `bun link` 對接本地 1.31.0 進行開發。

---

## Self-Review

- **Spec 覆蓋**:對應 spec「dbcli core 新增 — row-mutation builder」一節 —— 經探勘確認 core 已有更完整的 `DataExecutor`,決策改為「重用既有」(已與使用者確認),故本計畫為匯出而非新建,符合 DRY。
- **Placeholder 掃描**:無 TBD/TODO;每步有實際程式碼或指令與預期輸出。
- **型別一致**:`DataExecutor` 來自 `@/core/data-executor`;`DataExecutionResult` / `DataExecutionOptions` 來自 `@/types/data`(已確認檔案存在且匯出這兩型別)。
