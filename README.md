# dbcli-gui

A resource-light native desktop database client built on top of [`dbcli`](https://github.com/CarlLee1983/dbcli).
Think DBeaver / Sequel Ace, but leaner — the GUI is just the interface; the database
engine is `dbcli`'s core, imported as a library.

## Architecture (three layers)

```
Tauri shell (Rust, thin)      window + system webview + spawns/manages the sidecar
        │ spawn + health
Bun sidecar (long-lived)      imports @carllee1983/dbcli/core, connection pool, local HTTP API
        │ fetch (127.0.0.1, bearer token)
React webview                 connection list / schema tree / SQL editor / result grid
```

- **Engine reuse:** the sidecar `import`s `@carllee1983/dbcli/core` (the `./core` subpath
  export added in dbcli v1.28.0) — adapters for MySQL/PostgreSQL/MariaDB/MongoDB/Redis/Elasticsearch,
  permission enforcement, and blacklist protection come for free, no rewrite.
- **Resource efficiency:** system webview (no bundled Chromium) + one Bun process.

Full design: [`docs/dbcli-gui-design.md`](docs/dbcli-gui-design.md).

## v1 scope

Lightweight query workstation: read existing `.dbcli` connections → browse schema →
write SQL → result grid → export. `query-only` permission. macOS Apple Silicon first.
(Data editing, connection-management UI, ER diagrams, etc. are later versions.)

## v1.x 易用性

- **多查詢分頁**：每分頁是獨立查詢 session（各自 SQL/結果/排序/結果搜尋）；連線、schema 樹、查詢歷史跨分頁共用。
- **查詢歷史**：執行過的查詢記在本機（localStorage、去重、上限 100、標記連線來源），點擊回填到當前分頁。
- **schema 樹搜尋 / 結果搜尋**：側邊資料表與結果列皆可即時子字串過濾（客戶端）。
- **單格詳閱**：點結果格看完整值（JSON/長文字），可複製單格或整列。

## v2 ‧ 連線管理

- **GUI 內管理連線**：側邊「連線列表」標題列 `+` 新增、每條連線 hover 可編輯/刪除。
- **置中表單**：SQL 三系統（mysql/postgresql/mariadb）結構化欄位 + 「測試連線」即時驗證。
- **安全寫回 `.dbcli`**：透過 `@carllee1983/dbcli/core`（>=1.30.0）的連線 writer 寫 v2 多連線設定;密碼存連線專屬 env 檔（`{$env}` 參照、per-connection 命名空間），編輯時留白代表不修改、真實密碼不回傳前端。寫設定採原子寫（temp+rename）保護既有設定庫。
- **v1 自動升級**：對既有 v1 單連線專案新增第二條連線時，自動 migrate 成 v2（非 SQL 連線會擋下，避免毀損設定）。

## v2 ‧ 資料編輯

- **入口**：在側邊欄資料表列點該表的「編輯資料」按鈕（鉛筆圖示），開啟「表瀏覽」分頁。
- **編輯模式**：預設唯讀；按「編輯」進入可改狀態。改動以視覺標記累積為「暫存變更」（修改=黃底、新增列=綠底、待刪除=紅底+刪除線），按「儲存」以單一資料庫交易一次送出（全成或全敗）；「取消」放棄所有暫存。
- **權限需求**：INSERT / UPDATE 需連線權限 `read-write` 以上；DELETE 需 `data-admin` 以上；`query-only` 連線無法編輯（編輯按鈕停用）。
- **安全**：被 blacklist 的資料表或欄位無法編輯或寫入；無主鍵的資料表無法安全識別列，顯示提示並停用編輯。
- **範圍**：目前支援 SQL 三系統（MySQL / PostgreSQL / MariaDB）；任意 SQL 查詢結果目前為唯讀（未來支援單表查詢結果直接編輯）。

## Build order

1. **Bun sidecar** (engine + local HTTP API) — independently testable with `bun test`. ✓ done
2. **React frontend** (builds against the sidecar). ✓ done
3. **Tauri shell** (wires them together) — `bun run tauri dev` opens the native window. ✓ done
   (Distributable packaging — `.app`/`.dmg`, signing, notarize — is later work.)

## Conventions

- **Runtime:** Bun (see `CLAUDE.md`). `Bun.serve()` for the local API; no express.
- **zod pinned to v3** (`^3.25.76`) to match `dbcli`'s zod major — `@carllee1983/dbcli/core`'s
  generated types reference `zod`, so a v4 skew would break consumer typechecks. Keep aligned.

## Dev

```bash
bun install
bun test            # full suite: sidecar + dev harness + frontend (happy-dom)
bun run dev         # spawn the sidecar + serve the SPA with HMR; prints a
                    # http://localhost:3000/?port=…&token=… URL to open
bun run build       # production static build → ./dist (for the Phase C Tauri shell)
```

The frontend reads the sidecar port + bearer token from the URL query string
(`?port=&token=`). In dev, `dev/serve.ts` spawns the sidecar, reads its
`{ ready, port, token }` line, and injects them into the URL — the same way the
Phase C Tauri shell will. A working `.dbcli` connection config is needed to list
connections and run queries.

## 桌面開發(Tauri 殼)

前置:已安裝 Rust 工具鏈(`cargo`)。

```bash
bun install
bun run tauri dev      # 編譯 Rust 殼、build 前端、開原生視窗
```

Tauri 殼會自動 spawn `bun run sidecar/index.ts`,讀其 ready-line 取得隨機 port 與
token,並在開窗前以 `window.__DBCLI__` 注入給前端;關閉視窗會一併收掉 sidecar。

範圍說明:本階段僅供本機開發(`tauri dev`)。可散佈打包(`.app`/`.dmg`、簽章、notarize)
與 health 監控/重啟 UI 為後續工作。

## 端對端測試(E2E)

```bash
bunx playwright install chromium   # 首次:裝瀏覽器
bun run e2e                         # 跑四條核心旅程
```

E2E 用 `@playwright/test` 驅動 headless chromium,對一支 **hermetic fixture sidecar**
(注入種子資料的假 DB adapter,零外部服務)跑通:連線→schema→查詢→結果、匯出 CSV/JSON、
錯誤橫幅、黑名單保護。失敗時 `test-results/` 會留 screenshot/video/trace。

> E2E 採用 Playwright 自家 runner(非 `bun test`)以取得 webServer 自動啟動與 trace/video;
> 單元/整合測試仍全用 `bun test`。
