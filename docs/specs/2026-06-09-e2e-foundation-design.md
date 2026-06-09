# Foundation E2E — 設計文件

- **日期**:2026-06-09
- **狀態**:設計核准,待實作計畫
- **範圍代號**:`e2e-foundation`
- **前置**:Phase A(Bun sidecar)、Phase B(React 前端)、Phase C(Tauri 殼)皆已完成,
  `bun test` 122 pass、`cargo test` 3 pass、`tsc` 全綠

## 1. 目標與範圍

在開始擴張功能(資料編輯、連線管理 UI、ER 圖等 v1-後續)之前,先鋪好一張
**自動化端對端安全網**:用 Playwright 驅動真實瀏覽器,跑通核心使用者旅程,
讓日後每個 feature 都受回歸保護。

目前 122 個 `bun test` 只各別涵蓋 sidecar 與前端;**沒有任何測試驗證「整條接起來」**
(React ↔ sidecar HTTP ↔ 渲染)的使用者旅程。本輪補上這唯一缺口。

### 本輪做(in scope)

- 以 **`@playwright/test`** 驅動 headless chromium,跑通四條旅程:
  1. **核心 happy path**:列連線 → 選連線 → 展開 schema 樹 → 寫 SQL → `Cmd+Enter` 執行 → ResultGrid 顯示資料。
  2. **匯出 CSV/JSON**:查詢有結果後點 ExportButton,驗證下載檔內容。
  3. **錯誤狀態**:壞 SQL / sidecar 回錯 → ErrorBanner 正確顯示、app 不崩。
  4. **黑名單保護**:查被 blacklist 的表/欄 → 被擋下,驗證保護在 UI 層也生效。
- **Hermetic fixture sidecar**:沿用既有 `ConnectionPool` 的 `loadConfig`/`openAdapter` DI seam
  與 `createServer` 的 `listConnections` 注入,把最底層 DB adapter 換成種子假 adapter。
  零外部服務、零 docker、秒起、CI 友善。
- **最小 GitHub Actions CI**:`bun install` → `bun test` → 安裝 chromium → `bun run e2e`。
- 失敗時自動產出 screenshot / video / trace artifacts。

### 本輪不做(out of scope,留後續)

- **真 DB E2E**(docker Postgres、真 SQL 執行、真 dbcli adapter)。本輪只驗 UI↔sidecar 接線正確;
  adapter 層行為已由 sidecar 整合測試以 fake adapter 涵蓋。真 DB smoke 可作後續可選層。
- **驅動真 Tauri 原生視窗**。本輪打 dev-harness 等價的 web server(同 Bun 打包、同 SPA),
  覆蓋旅程價值的絕大部分;真視窗 smoke 另議。
- **可散佈打包、health 監控/重啟 UI** —— 各自獨立 spec。

## 2. 架構

Playwright `webServer` 啟動一支**只供測試的 fixture serve 腳本**,該腳本在同一進程內組兩件事:

```
@playwright/test (chromium, headless)
        │ baseURL = http://localhost:PORT/?port=&token=
        ▼
tests/e2e/serve-fixture.ts  ──┬── SPA:Bun.serve({ routes: { '/': src/index.html } })(HMR 關)
                              │
                              └── fixture sidecar:createServer({
                                       pool: new ConnectionPool({ loadConfig, openAdapter: 種子假 adapter }),
                                       token, port: 0,
                                       listConnections: 種子清單,
                                   })
```

- **不污染正式進入點**:`sidecar/index.ts` 與 `dev/serve.ts` 完全不動;fixture 走獨立腳本。
- **全程真實**:真 HTTP server、真 bearer-token 驗證、真 React 渲染、真 chromium;
  唯一被替換的是最底層 `DatabaseAdapter`(換成從種子回應的假實作)。
- 腳本印出帶 `port`/`token` 的 URL,Playwright 以此為 `baseURL` 開頁
  —— 與 Phase C Tauri 殼注入 `window.__DBCLI__`、dev harness 注入 query 是同一條參數來源路徑。

## 3. Fixture 資料與假 adapter

單一種子模組 `tests/e2e/fixtures/data.ts` 定義整個測試世界:

- **連線清單**:≥2 條(供 `listConnections` 與選連線測試),各帶 `system`。
- **每連線 schema**:tables + 各 table 的 columns(供 `listTables` / `getTableSchema`)。
- **查詢 rows**:供 `execute(sql)` 回傳,驅動 ResultGrid 與匯出。
- **blacklist**:至少一張保護表 + 一個保護欄,寫進 fixture `DbcliConfig.blacklist`。

`tests/e2e/fixtures/adapter.ts` 實作假 `DatabaseAdapter`,從種子回應:
- `connect` / `disconnect`:no-op。
- `listTables()` → 種子表清單。
- `getTableSchema(name)` → 種子欄。
- `execute(sql)` → 種子 rows;**當 SQL 含特定 token(`FORCE_ERROR`)時 throw**,驅動錯誤路徑。

**黑名單走真邏輯**:schema/query 路由用真的 `BlacklistManager(entry.config)` 過濾,
fixture 只提供帶 `blacklist` 的 config —— 保護行為由產品碼決定,測試不偽造。

## 4. 旅程與選擇器策略

`tests/e2e/journeys/` 下四檔:`happy-path.spec.ts`、`export.spec.ts`、`errors.spec.ts`、`blacklist.spec.ts`。

- 選擇器**優先 role/text**(`getByRole` / `getByText`),貼近使用者視角、抗重構。
- 僅在現有元件缺穩定 selector 時,於 `src/` 補**最小量 `data-testid`**;
  確切清單在 writing-plans 階段逐元件盤點後定。
- 匯出旅程用 Playwright 的 `download` 事件攔截檔案、驗證內容(dev-harness 走 `<a download>`)。

## 5. Artifacts、抗 flake 與 CI

- `@playwright/test` 預設:失敗時存 screenshot + video + trace 到 `test-results/`。
- `retries`:本地 0、CI 1;`projects: [chromium]` 單瀏覽器;fixture 唯讀 → 平行 context 安全。
- `.github/workflows/ci.yml`(新增,目前 repo 無任何 CI):
  `bun install` → `bun test` → `bunx playwright install --with-deps chromium` → `bun run e2e`。
- `.gitignore` 追加 `test-results/`、`playwright-report/`。

## 6. 檔案結構與改動

| 檔案 | 建立/修改 | 職責 |
|------|-----------|------|
| `playwright.config.ts` | 建立 | webServer / testDir / artifacts / chromium project |
| `tests/e2e/serve-fixture.ts` | 建立 | 組 fixture sidecar + SPA、印帶參數 URL |
| `tests/e2e/fixtures/data.ts` | 建立 | 種子資料集(連線/schema/rows/blacklist) |
| `tests/e2e/fixtures/adapter.ts` | 建立 | 假 `DatabaseAdapter`,從種子回應 |
| `tests/e2e/journeys/happy-path.spec.ts` | 建立 | 旅程 1 |
| `tests/e2e/journeys/export.spec.ts` | 建立 | 旅程 2 |
| `tests/e2e/journeys/errors.spec.ts` | 建立 | 旅程 3 |
| `tests/e2e/journeys/blacklist.spec.ts` | 建立 | 旅程 4 |
| `.github/workflows/ci.yml` | 建立 | 最小 CI(bun test + e2e) |
| `src/**` | 修改 | 僅在缺穩定 selector 處補 `data-testid` |
| `package.json` | 修改 | +devDep `@playwright/test`、+`"e2e"` script |
| `.gitignore` | 修改 | 忽略 `test-results/`、`playwright-report/` |

**明標 deviation:** E2E 採 `@playwright/test`(非 `bun test`)。理由:它是標準 E2E 工具,
免費提供 webServer 自動啟動、trace/video/screenshot artifacts、retry;手刻這些 glue 不划算。
CLAUDE.md 的「別用 vite/jest」針對打包與單元測試;E2E 是不同關注點。
**單元/整合測試仍全用 `bun test`,不受影響。**

## 7. 風險

1. **選擇器脆弱**:純靠文字選會隨 i18n/文案變動而碎 → 以 role 為主、必要處補 `data-testid`。
2. **fixture 與真 adapter 介面漂移**:假 adapter 若沒跟上 `DatabaseAdapter` 介面演進會失真
   → 假 adapter 以 `DatabaseAdapter` 型別約束,介面變動時 `tsc` 會擋。
3. **CI chromium 安裝時間**:`playwright install --with-deps` 較慢 → 可後續加 cache,本輪先求綠。
4. **HMR/打包差異**:fixture serve 關 HMR,與 dev 微異 → 同一 Bun 打包器,風險低。

## 8. 驗收標準

- `bun run e2e` 在本地 headless 跑通四條旅程、全綠。
- 四條旅程確實覆蓋:happy path 出 rows、匯出檔內容正確、錯誤出 ErrorBanner、blacklist 表被擋。
- 失敗時 `test-results/` 有 trace/video/screenshot。
- `.github/workflows/ci.yml` 在 GitHub Actions 跑 `bun test` + `bun run e2e` 全綠。
- `bun test`(122)與 `tsc` 不受影響、維持全綠。
