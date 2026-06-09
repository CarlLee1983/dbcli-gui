# 前端 v1.x 易用性 — 設計文件

- **日期**:2026-06-09
- **狀態**:設計核准,待實作計畫
- **範圍代號**:`frontend-v1x-usability`
- **前置**:Phase A(Bun sidecar)、Phase B(React 前端)、Phase C(Tauri 殼)、
  E2E Foundation 皆已完成,`bun test` 122 pass、`tsc` 全綠、`bun run e2e` 6 passed

## 1. 目標與範圍

v1 核心查詢工作台已到位(連線 → 瀏覽 schema → 寫 SQL → 結果表格 → 匯出)。
本輪在**不碰 sidecar 與後端 API** 的前提下,補上四項日常生產力功能,把單次查詢的
工作台升級為多分頁、有歷史、可搜尋的查詢環境。

### 本輪做(in scope)

1. **schema 樹搜尋**:Sidebar 頂部加子字串過濾框,表/view 一多時快速定位。
2. **結果區增強**:結果列即時搜尋(客戶端過濾)、複製單格/整列、點格開
   CellDetail modal 看完整值(JSON/長文字)。
3. **查詢歷史**:全域一份歷史(localStorage 持久化、去重、上限 100、每筆標記
   `connectionId`),HistoryPanel 點擊載入到當前分頁。
4. **多查詢分頁**:多個 SQL 分頁同時存在,**每分頁為獨立查詢 session**
   (各自 sql / result / 排序 / 結果搜尋);連線、schema 樹、歷史跨分頁共用。

### 本輪不做(非目標,YAGNI)

- SQL 語法高亮 / 自動補全(保留現有 textarea 編輯器)
- 後端分頁 / 後端過濾(結果搜尋與排序一律客戶端對記憶體 rows)
- 欄寬持久化、分頁拖曳排序、具名儲存查詢
- 資料編輯(寫入)— 屬 v2,permission 仍 query-only

## 2. 狀態架構(取向 A:拆分共用層 + 每分頁 session)

現行 `useSidecar` 把連線、schema、單一 sql/result/排序全綁在一個 hook。引入分頁後,
單一 hook 會膨脹且難測。改拆成「跨分頁共用層」與「每分頁 session」:

```
useApp(組合根,取代現 useSidecar 的對外角色)
├─ useConnections   連線清單 / open / select / schema 樹 / 欄位展開   ← 跨分頁共用
├─ useHistory       全域歷史(localStorage、去重、上限 100、標記 connectionId)
└─ useTabs          QuerySession[] + activeTabId;openTab / closeTab / renameTab / setActive
      每個 QuerySession:
        { id, title, sql, result, sortField, sortDir, resultFilter, loading, error }
```

- `useConnections`、`useHistory`、`useTabs` 各自為獨立、可單測的 hook;`useApp` 只做組合與接線。
- 每分頁的 `runQuery` 走共用 client(同一連線池),成功後寫一筆歷史。
- 對外介面盡量沿用現有 `SidecarApi` 的命名,降低 `App.tsx` 改動面。

### 為何不選其他取向

- **單一巨型 hook(B)**:改動少但檔案膨脹、難測,違背專案「小檔案、高內聚」慣例。
- **引入 zustand/jotai(C)**:目前全用原生 hooks,為這規模引狀態庫是 over-engineering。

## 3. 元件

| 檔案 | 動作 | 職責 |
|------|------|------|
| `views/TabBar.tsx` | 新增 | 分頁列;＋ 開新分頁、關閉鈕、active 高亮、雙擊重新命名 |
| `views/HistoryPanel.tsx` | 新增 | 歷史清單;每筆顯示 SQL 摘要、連線標記、相對時間;點擊載入到 active 分頁 |
| `components/CellDetailModal.tsx` | 新增 | 顯示單格完整值(物件以 JSON 縮排),可一鍵複製、Esc 關閉 |
| `views/Sidebar.tsx` | 改 | 頂部加 schema 搜尋框,子字串(不分大小寫)過濾 `tree` 的表/view |
| `views/ResultGrid.tsx` | 改 | 加結果列搜尋框(客戶端過濾)、點格開 CellDetail、複製格/整列 |
| `views/Editor.tsx` | 不變 | 保留 textarea;`onChange`/`onRun` 改接 active 分頁的 sql |
| `App.tsx` | 改 | 接 `useApp`;在 Editor 上方加 `TabBar`、側邊加 `HistoryPanel` 切換 |

### 純函式(便於單測,放對應檔或 `*-util.ts`)

- `filterTree(tree, query)` → 過濾後的 `TreeTable[]`
- `filterRows(rows, fields, query)` → 子字串符合任一欄的列
- `historyReducer` / `addHistoryEntry(list, entry)` → 去重 + 上限裁切
- `tabsReducer`(open/close/rename/setActive/patchSession)

## 4. 資料流

```
使用者在 active 分頁打 SQL → Cmd+Enter
  → useTabs.patchSession(activeId, { loading:true })
  → useConnections.client.query(connId, sql)
  → 成功:patchSession(activeId, { result, loading:false })
          useHistory.add({ sql, connectionId, ts, rowCount })
  → 失敗:patchSession(activeId, { error, loading:false })

點 HistoryPanel 某筆 → useTabs.patchSession(activeId, { sql })(只填 SQL,不自動執行)
點 ResultGrid 某格   → 開 CellDetailModal(該格值)
schema 搜尋框輸入     → filterTree 後渲染,不打後端
結果搜尋框輸入        → filterRows 後渲染(排序在過濾後套用),不打後端
```

- 結果搜尋與排序皆客戶端、對記憶體 rows,沿用現有 client-side sort 模式。
- 開新分頁預設空 sql、無 result;關閉 active 分頁後焦點落到相鄰分頁;關到 0 時自動留一個空白分頁。

## 5. 錯誤處理

- **每分頁各自**的 `error`(因 result 是分頁的):ErrorBanner 移到每分頁的主內容區頂部,
  只反映該分頁最近一次查詢的錯誤。
- **連線 / schema 類錯誤**(open、schemaTree、schemaTable)仍走全域,顯示在共用層級
  (沿用現有 ErrorBanner 位置或共用 banner)。
- localStorage 讀寫以 try/catch 包裹:解析失敗時退回空歷史,不讓壞資料導致整個 app 崩。

## 6. 實作分階段

逐階段獨立交付,每階段結束 `bun test` + `tsc` 全綠;分頁排最後(重塑狀態收尾):

1. **schema 樹搜尋** — 最小、孤立。Sidebar 加搜尋框 + `filterTree`。
2. **結果區增強** — `filterRows` + 結果搜尋框、CellDetailModal、複製格/列。
3. **查詢歷史** — `useHistory`(localStorage/去重/上限)+ `HistoryPanel`,接上 runQuery 記錄。
4. **多查詢分頁** — 拆 `useConnections` / `useTabs`、`useApp` 組合根、`TabBar`;
   把階段 1–3 的狀態收進每分頁 session。

> 階段 1–3 仍在現行單一 session 上做;階段 4 把它們「升級」成 per-tab。這樣前三階段
> 不被分頁重構卡住,且分頁階段只搬狀態、不重寫功能邏輯。

## 7. 測試策略

### 單元(`bun test` + happy-dom)

- `useHistory`:新增去重、上限 100 裁切、localStorage 持久化與壞資料退場。
- `filterTree`:大小寫不敏感子字串、空查詢回全部。
- `filterRows`:任一欄符合即留、空查詢回全部、與排序組合。
- `tabsReducer`:open 產生空分頁、close 後 active 落點、關到 0 補空白分頁、patchSession 隔離。
- `CellDetailModal`:物件以 JSON 顯示、複製呼叫 clipboard、Esc 關閉。

### E2E(Playwright,擴充現有 hermetic fixture)

- 開第二分頁 → 在分頁 B 查詢不影響分頁 A 的結果/SQL。
- 執行查詢後 HistoryPanel 出現該筆 → 點擊回填 SQL。
- schema 搜尋框輸入 → 樹只剩符合的表。
- 結果搜尋框輸入 → 結果列只剩符合的。
- 點結果格 → CellDetailModal 顯示完整值。

## 8. 驗收標準

- 四項功能可用:schema 樹可搜尋過濾;結果可搜尋、可複製、可看單格完整值;查詢歷史
  跨連線記錄、可回填;多分頁各自獨立 session、連線/schema/歷史共用。
- `bun test` 維持全綠(新增上述單元測試),`tsc --noEmit` 無錯。
- `bun run e2e` 全綠(新增上述 E2E 旅程)。
- 各前端檔案維持小而聚焦(<400 行),新 hook 各自可獨立測試。
- 無 sidecar / 後端 API 改動;permission 仍 query-only。
