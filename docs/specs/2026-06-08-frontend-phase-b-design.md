# dbcli-gui Phase B — v1 查詢工作台前端 設計文件

- **日期**：2026-06-08
- **狀態**：設計核准，待實作計畫
- **前置**：Phase A（Bun sidecar 核心 + 剩餘 routes）已完成並併入 `main`。本文件涵蓋 design `docs/dbcli-gui-design.md` §4.3 的前端模組。
- **不在範圍**：Phase C（Tauri 殼、打包、生命週期）。本階段只產出可在瀏覽器跑的前端 + 對接既有 sidecar 的 dev harness。

## 1. 目標

實作 design §1.1 的「輕量查詢工作台」前端：選連線 → 瀏覽 schema → 寫 SQL → 看結果表格 → 匯出。透過 localhost HTTP（帶 token）對接 Phase A 的 sidecar。

## 2. 架構

### 2.1 連接模型（dev，URL 注入）

Phase C 的 Tauri 殼尚未存在，因此本階段用一個 dev harness 取代殼的「spawn sidecar + 注入 token/埠」職責：

```
bun run dev  (dev/serve.ts)
  → spawn `bun run sidecar/index.ts` 子行程
  → 讀子行程 stdout 第一行 JSON：{ ready, port, token }
  → Bun.serve（HTML import 伺服 src/index.html）固定埠（如 3000）
  → console 印出可點開的 URL：http://localhost:3000/?port=<sidecarPort>&token=<token>
  → 前端從 location.search 讀 port+token（與 Tauri prod 注入方式一致）
  → dev server / 行程結束時：kill sidecar 子行程
```

此模型與 prod 一致：Tauri 也會把 token/埠以 query string 傳給 webview，前端讀取邏輯不變。

### 2.2 跨來源（CORS）— sidecar 小改動

前端在 dev server 的 origin（`http://localhost:3000`）以 `fetch` 打 sidecar 的 `http://127.0.0.1:<隨機埠>`，屬跨來源請求，瀏覽器會擋且對非簡單請求（帶 `Authorization` 標頭、`POST application/json`）發 `OPTIONS` preflight。因此 sidecar 需要：

- 對所有回應補上 CORS 標頭：
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
  - `Access-Control-Allow-Headers: authorization, content-type`
- 對 `OPTIONS` preflight 回 `204 No Content` + 上述標頭（在 bearer 驗證之前處理，preflight 不帶 token）。

**安全論證**：驗證走 bearer token、不使用 cookie，故 `Access-Control-Allow-Origin: *` 不會讓無 token 的網頁讀到任何資料；token 才是閘門。不啟用 `Access-Control-Allow-Credentials`。

實作方式：在 `sidecar/server.ts` 包一層 `withCors(handler)`（或在 `Bun.serve` 的回應出口統一補標頭），並在路由表加 `OPTIONS` 短路。`/health` 既有行為不變，只多 CORS 標頭。

### 2.3 前端模組（`src/`）

```
src/
├── index.html          # HTML import 入口，<script src="./main.tsx">
├── main.tsx            # createRoot(document.getElementById('root')).render(<App/>)
├── index.css           # @import "tailwindcss"; + Inter 字型
├── api/
│   ├── client.ts       # 帶 token 的 fetch 封裝 + ApiError
│   └── types.ts        # 回應型別（沿用 shared/schemas.ts 的 request 型別）
├── hooks/
│   └── useSidecar.ts   # 應用狀態 + 動作（選連線/查詢/匯出/載 schema）
├── views/
│   ├── Sidebar.tsx
│   ├── Editor.tsx
│   ├── ResultGrid.tsx
│   └── ExportButton.tsx
├── components/
│   ├── ErrorBanner.tsx
│   └── Spinner.tsx
└── App.tsx             # 3-pane 版面 + 組裝
```

#### `api/client.ts`

從 `new URLSearchParams(location.search)` 讀 `port`、`token`，base = `http://127.0.0.1:<port>`。匯出函式（皆帶 `Authorization: Bearer <token>`）：

| 函式 | 對應 route | 回傳 |
|------|-----------|------|
| `health()` | `GET /health` | `{ ok, version }` |
| `listConnections()` | `POST /connections/list` | `{ connections: ConnectionSummary[] }` |
| `openConnection(id)` | `POST /connections/open` | `{ ok, system }` |
| `closeConnection(id)` | `POST /connections/close` | `{ ok }` |
| `query(id, sql, limit?)` | `POST /query` | `{ rows, fields, rowCount, ms }` |
| `schemaTree(id)` | `POST /schema/tree` | `{ tables: TreeTable[] }` |
| `schemaTable(id, table)` | `POST /schema/table` | `{ table: TableSchemaDto }` |
| `exportRows(id, sql, format)` | `POST /export` | `Blob`（觸發瀏覽器下載） |

非 2xx 時解析 `{ error: { code, message } }` 並 `throw new ApiError(code, message, status)`。`exportRows` 讀 `response.blob()`，用 `content-disposition` 的檔名建立 `<a download>` 觸發下載。

回應型別（`api/types.ts`，對照 sidecar 實際輸出）：
- `ConnectionSummary = { name: string; system: string; isDefault: boolean }`
- `QueryResultDto = { rows: Array<Record<string, unknown>>; fields: string[]; rowCount: number; ms: number | null }`
- `TreeTable = { name: string; type: string; columnCount?: number; rowCount?: number | null }`
- `TableColumnDto = { name: string; type: string; nullable: boolean; primaryKey?: boolean; default?: string }`（取 sidecar 回傳的 `ColumnSchema` 子集；blacklist 欄位已在 sidecar 端剝除）
- `TableSchemaDto = { name: string; columns: TableColumnDto[]; primaryKey?: string[]; indexes?: Array<{ name: string; columns: string[]; unique: boolean }> }`

#### `hooks/useSidecar.ts`

集中應用狀態與動作，避免 view 直接碰 client：
- state：`connections`、`activeConnectionId`、`tree`、`expandedTable`（table→欄位）、`sql`、`result`、`error`、`loading` 旗標
- actions：`refreshConnections()`、`selectConnection(id)`（= open + schemaTree）、`loadTableColumns(table)`、`setSql(s)`、`runQuery()`、`insertSelect(table)`（把 `SELECT * FROM <table> LIMIT 100` 設進 `sql`）、`exportResult(format)`
- 啟動時呼叫 `health()` 確認 sidecar 在線；失敗顯示錯誤頁

#### `views/Sidebar.tsx`
- 連線清單（`connections`），點選 → `selectConnection`，標示 active 與 isDefault
- schema 樹：列出 `tree.tables`（table/view 以圖示或標籤區分）；點 table → `loadTableColumns` 展開欄位（名稱/型別/PK 標記）；table 列上有按鈕（或雙擊）→ `insertSelect(table)`

#### `views/Editor.tsx`
- 等寬 `<textarea>` 綁 `sql`；`Run` 按鈕；`Cmd/Ctrl+Enter` → `runQuery()`
- 無語法高亮（v1 YAGNI，留待 v1.1）

#### `views/ResultGrid.tsx`
- 自寫固定列高虛擬捲動（無第三方依賴）：依 `scrollTop`、容器高、固定 `ROW_HEIGHT` 算出可視區間，只渲染該區間的列 + 上下 padding spacer
- 欄位順序取 `result.fields`；點表頭做 client-side 排序（字串/數字比較，三態：原序→升→降）
- footer 顯示 `rowCount` 與 `ms`
- 空結果/未查詢顯示提示

#### `views/ExportButton.tsx`
- CSV / JSON 下拉；呼叫 `exportResult(format)`（內部 `exportRows` 用「目前已執行的 SQL」）→ 下載
- 無結果時 disabled

#### `components/`
- `ErrorBanner`：吃 `ApiError`，依 `code` 顯示友善訊息（見 §4），可關閉
- `Spinner`：載入指示

### 2.4 資料流（一次查詢）

```
使用者 Cmd/Ctrl+Enter
  → useSidecar.runQuery()
  → api.query(activeConnectionId, sql)        // 帶 token
  → sidecar /query（強制 query-only + blacklist）
  → setResult({ rows, fields, rowCount, ms })
  → ResultGrid 虛擬捲動渲染；ExportButton 啟用
錯誤 → ApiError → ErrorBanner 顯示友善訊息（不卡死）
```

## 3. 樣式與建置

- **Tailwind v4 + Inter**：`index.css` 用 `@import "tailwindcss"`，沿用 dbcli ui-template 的 Inter 字型與視覺語言。透過 Bun bundler 的 Tailwind 外掛處理（`bun-plugin-tailwind`，於 `bunfig.toml` 註冊；確切 wiring 於計畫階段以 context7 查證 Bun + Tailwind v4 現行做法後固定）。
- **Dev**：`bun run dev` → `dev/serve.ts`（§2.1）。HMR 啟用。
- **Prod build**：`bun build src/index.html --outdir dist`（產出靜態資產供 Phase C 的 Tauri 載入；本階段不接 Tauri）。
- **依賴**：`react@19`、`react-dom@19`、`lucide-react`（圖示）已在 node_modules，需提升為直接依賴；新增 `tailwindcss@4`、`bun-plugin-tailwind`、測試用 `@testing-library/react`、`@testing-library/dom`、`@happy-dom/global-registrator`。`recharts` v1 不需要（圖表屬後續視覺化範圍）。

## 4. 錯誤處理

統一以 `ApiError { code, message, status }` 經 `ErrorBanner` 顯示：

| code | 友善訊息 | 備註 |
|------|----------|------|
| `BLACKLISTED` | 此表受保護，無法存取 | 403 |
| `PERMISSION` | 唯讀模式，不允許寫入語句 | 403（強制 query-only）|
| `NOT_OPEN` | 連線未開啟，正在重新連線… | 自動 `openConnection` 後重試一次，再失敗才顯示 |
| `CONNECTION` | 資料庫連線失敗 | 502 |
| `BAD_REQUEST` | 請求格式錯誤 | 400 |
| 其他 / `INTERNAL` | 發生未預期錯誤 | 500，原始訊息進 console |

sidecar 離線（`health` 失敗或 fetch 例外）→ 顯示「引擎未連線」狀態頁，提供重試。

## 5. 測試策略

- **工具**：`bun test` + `@testing-library/react` + `@happy-dom/global-registrator`（preload 註冊 DOM 全域）。
- **api/client**：以 fake `fetch`（注入或 monkeypatch `globalThis.fetch`）測各函式帶對 token、組對 URL、2xx 解析、非 2xx 丟 `ApiError`、export 觸發下載（驗 `<a download>` 與 blob）。
- **views**（mock `useSidecar` 或注入假 actions/props）：
  - Sidebar：渲染連線清單；點選觸發 `selectConnection`；點 table 展開欄位；insert 按鈕呼叫 `insertSelect`
  - Editor：輸入更新 `sql`；`Cmd/Ctrl+Enter` 與 Run 按鈕觸發 `runQuery`
  - ResultGrid：依 `fields` 渲染表頭；渲染列；點表頭排序切換；footer 顯示 rowCount/ms；大資料只渲染可視列（驗虛擬捲動）
  - ExportButton：選 CSV/JSON 呼叫 `exportResult`；無結果時 disabled
  - ErrorBanner：依 code 顯示對應訊息
- **sidecar CORS**：在 `tests/sidecar/` 加測 `OPTIONS` 回 204 + CORS 標頭、一般回應帶 `Access-Control-Allow-Origin`。
- 目標覆蓋率 80%（沿用專案規則）。

## 6. 元件邊界檢查

- `api/client` 只負責 HTTP + 型別轉換，不含 UI 狀態；可獨立測。
- `useSidecar` 是唯一碰 client 的地方，views 透過 props/hook 取資料，可用假資料獨立測。
- 每個 view 單一職責、檔案聚焦（<300 行）。
- 虛擬捲動邏輯封裝在 ResultGrid 內，純函式（算可視區間）可單獨測。

## 7. 任務切分（交由 writing-plans 細化）

1. sidecar CORS enabler（+ 測試）
2. dev harness `dev/serve.ts`（spawn sidecar + URL 注入 + HMR 伺服）
3. Tailwind/Bun 建置骨架（`index.html`/`main.tsx`/`index.css`/`bunfig.toml` + 依賴）
4. `api/types.ts` + `api/client.ts`（+ 測試）
5. `useSidecar` hook（+ 測試）
6. `App` 3-pane 版面 + `ErrorBanner`/`Spinner`
7. `Sidebar`（+ 測試）
8. `Editor`（+ 測試）
9. `ResultGrid` 虛擬捲動 + 排序（+ 測試）
10. `ExportButton`（+ 測試）
11. 串接 + 手動 smoke（`bun run dev` 對真實/測試 DB 跑一次查詢→匯出）
