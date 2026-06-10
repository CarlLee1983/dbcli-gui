# v2 ‧ 全域連線 + Workspace 切換 — 設計文件

> 狀態:設計定稿,待寫實作計畫。
> 範圍:dbcli-gui v2 子系統「全域連線」。把連線儲存從「啟動目錄綁定」改為「預設全域 `~/.dbcli`」,並在標題列提供 runtime 的 workspace 切換,讓 GUI 像一般 DB Browser(DBeaver / Sequel Ace)。只動 dbcli-gui(sidecar + 前端 + Tauri shell);dbcli core 不需改動。
> 後續:本子系統完成後,接「表格多頁籤」子系統(spec: 2026-06-10-table-detail-tabs-design.md)。

## 目標

讓使用者開啟 dbcli-gui 時,**預設看到一份全域連線清單**(`~/.dbcli`),不再受啟動目錄影響;並可在標題列**切換到手動加入的專案 workspace**,切換即時生效(重建連線池、刷新連線清單)。沿用既有連線管理 UI 的寫回邏輯(對 active store 的 `.dbcli` 操作),不重寫引擎層。

## 已確認決策(腦力激盪結論)

1. **全域為主,可選專案覆蓋**:預設讀全域庫;專案 workspace 由使用者手動加入,可切換。
2. **切換機制 = GUI 內 runtime 切換**:標題列 workspace 選單即時切換,sidecar 需支援 runtime 換 config store(重建 pool + lister、closeAll 舊連線)。
3. **全域路徑 = `~/.dbcli`**:與 dbcli CLI 慣例一致,CLI 與 GUI 共用同一份連線。
4. **workspace 清單 = 手動管理**:選單含「全域」+ 使用者 Add/Remove 的專案;清單持久化於 `~/.dbcli/workspaces.json`,並記 `lastActiveId`。
5. **切換時一併重置查詢分頁**:換 workspace 時清空 active connection、schema 樹、表分頁與查詢分頁,避免跨庫誤用。

## 架構(單 repo,3 層)

```
┌─ Tauri shell ───────────────────────────────────────────┐
│  src-tauri/src/main.rs                                   │
│    不再用 current_dir 決定 store;sidecar 自行解析 ~/.dbcli│
│    (current_dir 仍可保持 repo_root 以利 `bun run`)        │
└─────────────────────────────────────────────────────────┘
                 │ spawn + ready line
┌─ dbcli-gui sidecar ─────────────────────────────────────┐
│  config.ts          預設 store = ~/.dbcli(展開 home)    │
│  workspaces.ts ←新   registry 讀寫(~/.dbcli/workspaces.json)│
│  active-store.ts ←新 可變 active store: {dbcliPath,pool,  │
│                      lister};select() 做 closeAll+重建   │
│  routes/workspaces.ts ←新                                │
│    GET /workspaces            列出(global + 已加入)      │
│    POST /workspaces           加入(指定資料夾)          │
│    DELETE /workspaces/:id     移除                        │
│    POST /workspace/select     切換(closeAll→換→回連線清單)│
│  server.ts          改吃「active store」而非固定 dbcliPath │
└─────────────────────────────────────────────────────────┘
                 │ fetch (127.0.0.1, bearer)
┌─ dbcli-gui 前端 ────────────────────────────────────────┐
│  hooks/useWorkspaces.ts ←新  清單 / 加入 / 移除 / 切換   │
│  views/WorkspaceSwitcher.tsx ←新  標題列下拉             │
│  api/client.ts + api/types.ts  加 workspace 端點與型別   │
│  App.tsx / useApp.ts  切換時重置 connection+tabs 狀態    │
└─────────────────────────────────────────────────────────┘
```

## 元件設計

### Sidecar:config 解析(`config.ts`)
- `resolveSidecarConfig` 的 `dbcliPath` 預設改為 `join(homedir(), '.dbcli')`,不再從 `workdir` 推導。
- 保留 `DBCLI_GUI_GLOBAL_DIR` env 覆寫(測試與進階使用)。`DBCLI_GUI_WORKDIR` **退役**(不再決定 store);專案一律走 workspace registry 手動加入。

### Sidecar:workspace registry(`workspaces.ts`)
- 檔案:`~/.dbcli/workspaces.json`,GUI 專屬 metadata,**不碰** core 的 `config.json`。
- 結構:
  ```jsonc
  {
    "version": 1,
    "lastActiveId": "global",
    "workspaces": [
      { "id": "global", "label": "全域", "kind": "global", "path": "~/.dbcli" },
      { "id": "<uuid>", "label": "my-proj", "kind": "project", "path": "/abs/proj/.dbcli" }
    ]
  }
  ```
- `global` 為隱含固定項:即使檔案不存在也回傳 global;`path` 永遠是 `~/.dbcli`。
- 純函式 + 一層 IO seam(仿 `ListerDeps`),方便單元測 add/remove/persist/lastActive,不需真實檔案。
- 加入 workspace 時 `path` 指向「選取資料夾下的 `.dbcli`」(若不存在,延後到首次寫連線時由既有 writer 建立)。
- `id` 用穩定 UUID;`label` 預設取資料夾名,可重複(以 id 區分)。

### Sidecar:可變 active store(`active-store.ts`)
- 持有 `{ id, dbcliPath, pool, lister }`,取代 `index.ts` 目前建構時固定的 pool/lister。
- `select(id)`:
  1. 由 registry 解析該 id 的 `dbcliPath`。
  2. `await current.pool.closeAll()`。
  3. 以新 `dbcliPath` 建 `ConnectionPool(defaultPoolDeps(...))` 與 `defaultConnectionLister(...)`。
  4. 更新 registry `lastActiveId` 並持久化。
  5. 回傳新連線清單(等同呼叫新 lister)。
- 啟動時讀 `lastActiveId` 還原;解析失敗(如專案路徑已不存在)則 fallback 回 global 並提示。

### Sidecar:路由(`routes/workspaces.ts`)
- `GET /workspaces` → `{ workspaces, activeId }`。
- `POST /workspaces { path, label? }` → 驗證為絕對路徑、可存取;加入並回新清單。
- `DELETE /workspaces/:id` → 不可刪 `global`;若刪到 active 則切回 global。
- `POST /workspace/select { id }` → 走 `active-store.select`,回 `{ connections, activeId }`。
- 全部沿用既有 `toErrorBody` / `statusForCode` 錯誤封裝。

### Tauri shell(`main.rs`)
- 移除「store 綁 `current_dir`」的語意依賴;store 路徑由 sidecar 從 `~/.dbcli` 解析。
- 「加入 workspace」的資料夾選擇走前端 Tauri dialog plugin(已在依賴內),把絕對路徑 POST 給 sidecar。

### 前端
- `useWorkspaces`:`list()` / `add(path,label?)` / `remove(id)` / `select(id)`;持有 `workspaces` 與 `activeId`。
- `WorkspaceSwitcher`:標題列下拉,列「全域 / 已加入專案」,底部「加入 workspace…」(開 Tauri folder dialog)與每筆 hover 的移除。
- 切換流程(`useApp` / `App.tsx`):呼叫 `select(id)` 成功後,**重置** active connection、`expandedColumns`、schema 樹、所有表分頁與查詢分頁(回到單一空白查詢分頁),再以回傳的新連線清單刷新側欄。

## 資料流

1. 啟動 → sidecar 讀 registry 的 `lastActiveId` → 還原 active store → ready line。
2. 前端載入 → `GET /workspaces` 取清單與 activeId → 渲染側欄連線(走現有 `/connections/list`)。
3. 使用者切 workspace → `POST /workspace/select` → sidecar closeAll+重建 → 前端重置狀態並用回傳連線清單刷新。
4. 加入 workspace → folder dialog → `POST /workspaces` → 更新下拉(不自動切換,使用者再點選)。

## 錯誤處理

- 全域 `~/.dbcli` 首次不存在 → lister 丟 NOT_CONFIGURED → 前端顯示「尚無連線,按＋新增」;首次建立連線時 writer 建目錄(沿用連線管理寫回路徑)。
- 加入的專案資料夾無 `.dbcli` → 同上空清單,可直接新增。
- 切換目標路徑已不存在 → select 回錯,前端維持原 workspace 並顯示錯誤。
- 切換時有開啟連線 → 先 `closeAll` 再換,避免連線洩漏。
- registry 檔毀損(JSON parse 失敗) → 視為僅含 global,記 warning,不阻擋啟動。

## 測試策略

- **單元(sidecar)**:`config` 解析(home 展開、env 覆寫);registry add/remove/persist/lastActive/global 隱含項(IO seam,免真實檔案);`active-store.select`(closeAll 被呼叫、pool/lister 重建、lastActive 寫入)。
- **單元(前端)**:`useWorkspaces`(list/add/remove/select 狀態轉移);切換時的狀態重置邏輯。
- **E2E**:加入 workspace → 切換 → 側欄連線清單改變 → 查詢分頁被重置。

## 非目標(YAGNI)

- 不做 workspace 內的多資料庫/多 schema 樹狀切換(維持現有單庫連線模型)。
- 不做 workspace 匯入/匯出、雲端同步。
- 不自動掃描磁碟尋找專案;只手動加入。
- 不在切換時嘗試保留/搬移查詢分頁內容(明確重置)。
