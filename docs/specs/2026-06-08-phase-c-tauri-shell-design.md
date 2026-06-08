# Phase C — Tauri 原生殼設計文件

- **日期**：2026-06-08
- **狀態**：設計核准,待實作計畫
- **範圍代號**：`phase-c-tauri-shell`
- **前置**：Phase A(Bun sidecar)、Phase B(React 前端)皆已完成且測試全綠

## 1. 目標與範圍

把已完成的 Bun sidecar 與 React 前端包進一個**原生桌面視窗**,讓 `bun run tauri dev`
能在本機開出 dbcli-gui 桌面 app,跑通「開連線 → 瀏覽 schema → 寫 SQL → 看結果 → 匯出」。

### 本輪做(in scope)

- Tauri v2 殼,以 `cargo tauri dev`(經 `bun run tauri dev`)開原生 webview 視窗。
- Rust 殼負責 sidecar 完整生命週期:spawn → 讀 ready-line → 開窗注入 port/token → 收尾。
- 前端與 sidecar 兩層**零改動**(除非 query 穿透 spike 失敗,見 §6)。
- Rust 純函式 `parse_ready_line` 的 TDD 單元測試。

### 本輪不做(out of scope,留後續獨立 spec)

- **health 監控 + 重啟引擎 UI**:sidecar 掛掉時偵測 `/health` 失敗 → 顯示「重啟引擎」按鈕。
  本輪 sidecar 死亡僅讓 app 一併退出(不卡死、不自動重啟)。
- **可散佈打包**:`bun build --compile` 編譯 sidecar、Tauri externalBin、`cargo tauri build`
  產出 .app/.dmg、簽章、notarize、自動更新。
- **自動化 E2E**:Playwright 驅動 webview。維持先前決定,本輪不做。

## 2. 架構

Rust 殼是 sidecar 生命週期的**唯一擁有者**。Tauri 只負責原生視窗 + 程序編排;
DB 邏輯仍全在 sidecar(import core),前端純畫面。

```
bun run tauri dev
  └─ beforeDevCommand: bun run build           → 產出 dist/
  └─ Rust setup():
       spawn `bun run sidecar/index.ts`         (cwd = repo root)
       讀第一行 stdout {ready,port,token}
       開 WebviewWindow → WebviewUrl::App("index.html?port=X&token=Y")
       │  前端 readConnParams() 讀 location.search  ← 零改動
       └─ fetch http://localhost:X (Authorization: Bearer token) → sidecar
  視窗關閉 / sidecar 自己死 → kill 子程序 + app 退出
```

**切分理由**:前端早已用 `src/api/client.ts` 的 `readConnParams()`(讀 `location.search`,
註解明載「dev harness or Tauri shell」)預留好注入點,故殼以 query string 注入 → 前端零改動。
dist 資產為相對路徑(`./chunk-*`),適配 Tauri asset protocol。

## 3. 元件

新增 `src-tauri/`,手寫精簡版(不用 `tauri init` 的 React 樣板,避免冗餘)。

| 檔案 | 職責 |
|------|------|
| `src-tauri/Cargo.toml` | 依賴 `tauri` 2、`tauri-build` 2、`serde`、`serde_json` |
| `src-tauri/tauri.conf.json` | `build.frontendDist:"../dist"`、`build.beforeDevCommand:"bun run build"`、無靜態 window(程式建立)、CSP 放行 localhost(§6) |
| `src-tauri/build.rs` | `fn main() { tauri_build::build() }` |
| `src-tauri/src/main.rs` | 進入點 + 生命週期邏輯 + `parse_ready_line` |
| `src-tauri/icons/` | placeholder 圖示(`tauri icon` 產生) |

工具鏈接線:

- `package.json`:`@tauri-apps/cli` 加為 devDependency,新增 script `"tauri": "tauri"`
  → `bun run tauri dev` / `bun run tauri build`。
- `.gitignore`:加 `src-tauri/target/`。

## 4. 生命週期邏輯(Rust)

### 4.1 `parse_ready_line`(純函式,可測)

```
fn parse_ready_line(line: &str) -> Result<ReadyLine, String>
struct ReadyLine { port: u16, token: String }
```

- 解析 sidecar 印出的 JSON 行 `{"ready":true,"port":<number>,"token":"<hex>"}`。
- 失敗情境:非合法 JSON、缺 `port`、缺 `token` → 回傳描述性 `Err`。
- **TDD 三案**:合法行 → Ok;缺欄位 → Err;壞 JSON → Err。

### 4.2 spawn 與開窗(`setup()`)

1. `std::process::Command::new("bun")`，`args(["run", "sidecar/index.ts"])`，
   `current_dir(repo_root)`,`stdout(Stdio::piped())`,`spawn()`。
   - `repo_root` 以 `env!("CARGO_MANIFEST_DIR")` 的上一層解析(dev-only 範圍,可接受)。
   - sidecar 依現有 `config.ts` 自帶隨機 port + token,殼不需自行產生。
2. 以 `BufReader` 讀子程序 stdout **首行** → `parse_ready_line` → 取得 `port`、`token`。
3. `WebviewWindowBuilder::new(app, "main",
   WebviewUrl::App(format!("index.html?port={port}&token={token}").into()))`
   設定 title / 預設尺寸後 `.build()`。
4. `Child` 存入 Tauri managed state `Mutex<Option<Child>>`,供收尾使用。

### 4.3 收尾

- `app.run(|handle, event| ...)` 攔 `RunEvent::ExitRequested` → 從 state 取出 `Child` 並 `kill()`。
- 另起 thread `child.wait()`:sidecar 先死 → `handle.exit(0)`(app 一併退出,不卡死)。

### 4.4 實作取捨

spawn + 讀 stdout 採 **`std::process::Command` + thread**(零外掛、免 capability 設定),
不用 `tauri-plugin-shell`(需設執行 `bun` 的權限、較重)。

## 5. 錯誤處理

- **ready-line 讀取失敗 / parse 失敗**:`setup()` 回傳 `Err`,Tauri 啟動中止並印錯;
  視為硬性前置失敗(sidecar 沒正常起來,app 無法運作)。
- **sidecar 啟動後死亡**:§4.3 的 wait thread 觸發 `exit(0)`,app 乾淨退出(不自動重啟 — 留後續)。
- **視窗關閉**:`ExitRequested` 殺 sidecar,避免孤兒程序。

## 6. 必須早驗的整合風險

1. **CSP(致命)**:前端全程 `fetch http://localhost:<port>`。Tauri v2 預設 CSP 會擋。
   `tauri.conf.json` 的 `app.security.csp` 須含:
   `connect-src 'self' ipc: http://ipc.localhost http://localhost:* http://127.0.0.1:*`;
   Google Fonts 另需 `style-src` / `font-src` 放行 `https://fonts.googleapis.com` /
   `https://fonts.gstatic.com`(或接受退回系統字型)。
2. **query 穿透 asset protocol**:`WebviewUrl::App("index.html?...")` 的 query 須能進到
   `window.location.search`。**第一步先做 spike 驗證**。
   - Fallback:若 query 不穿透,改用 `WebviewWindowBuilder::initialization_script` 注入
     `window.__DBCLI__ = { port, token }`,並讓 `src/api/client.ts` 的 `readConnParams`
     多讀此來源(那才需動到前端少數幾行)。

## 7. 測試策略

- **單元(Rust)**:`parse_ready_line` 三案,TDD 先紅後綠(`cargo test`)。
- **手動 smoke**:`bun run tauri dev` 開窗 → Sidebar 列連線 → 跑查詢 → 看結果 → 匯出;
  寫進 README「桌面開發」段落。
- **既有套件**:`bun test`(117 pass)維持全綠,本輪不應動到 sidecar/前端而破壞。
- **自動化 E2E**:本輪不做。

## 8. 驗收標準

- [ ] `bun run tauri dev` 開出原生視窗,顯示 React 前端(非空白)。
- [ ] 前端成功 `fetch` 到 sidecar(CSP 未擋),Sidebar 能列出 `.dbcli` 連線。
- [ ] 能開連線、跑查詢、看結果、匯出。
- [ ] 關閉視窗後無殘留 `bun sidecar` 孤兒程序;sidecar 死亡時 app 一併退出。
- [ ] `cargo test`(Rust 單元)與 `bun test`(既有 117)皆綠。
