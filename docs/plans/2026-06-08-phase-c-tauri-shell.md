# Phase C — Tauri 原生殼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已完成的 Bun sidecar 與 React 前端包進一個 Tauri v2 原生視窗,`bun run tauri dev` 能在本機開出 dbcli-gui 桌面 app 並跑通查詢工作台。

**Architecture:** Rust 殼是 sidecar 生命週期的唯一擁有者:在 `setup()` spawn `bun run sidecar/index.ts`、讀 stdout 首行 `{ready,port,token}`、用 `initialization_script` 把 `window.__DBCLI__ = { port, token }` 注入 webview(因 `WebviewUrl::App` 不保留 query string),再開 `index.html` 視窗。前端 `readConnParams` 改為優先讀此全域、退回 URL query。視窗關閉或 sidecar 死亡時收掉子程序。

**Tech Stack:** Tauri v2(Rust)、`@tauri-apps/cli`(經 `bun run tauri`)、`serde`/`serde_json`、既有 Bun + React 前端。

**Scope:** dev-runnable only。不含 health/重啟 UI、`tauri build` 打包/簽章/notarize、自動化 E2E(見 spec §1)。

**Spec:** `docs/specs/2026-06-08-phase-c-tauri-shell-design.md`

---

## File Structure

| 檔案 | 建立/修改 | 職責 |
|------|-----------|------|
| `package.json` | 修改 | 加 `@tauri-apps/cli` devDep + `"tauri"` script |
| `.gitignore` | 修改 | 忽略 `src-tauri/target/` |
| `scripts/make-icon.ts` | 建立 | 產生 placeholder 來源 PNG(供 `tauri icon`) |
| `src-tauri/Cargo.toml` | 建立 | Rust crate 依賴 |
| `src-tauri/build.rs` | 建立 | `tauri_build::build()` |
| `src-tauri/tauri.conf.json` | 建立 | 視窗/CSP/frontendDist 設定 |
| `src-tauri/src/main.rs` | 建立 | 進入點 + `parse_ready_line` + 生命週期 |
| `src-tauri/icons/*` | 產生 | 視窗/打包圖示(由 `tauri icon` 產出) |
| `src/api/client.ts` | 修改 | `readConnParams` 優先讀 `window.__DBCLI__` |
| `tests/frontend/client.test.ts` | 修改 | 新增注入全域的測試 |
| `README.md` | 修改 | 新增「桌面開發(Tauri)」段落 |

**任務順序理由:** 先 Task 1 立起 Tauri 骨架並實證「dev 能 serve dist + 開窗 + 載入前端 + CSP 不擋資產」(最大未知);再 Task 2/3 各自完成前端與 Rust 的純單元(可獨立測試);Task 4 整合 sidecar 並實證 CSP connect-src;Task 5 文件與全綠驗收。

---

## Task 1: Tauri 骨架 + 開窗(尚未接 sidecar)

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `scripts/make-icon.ts`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Generate: `src-tauri/icons/*`

- [ ] **Step 1: 安裝 Tauri CLI 並加 script**

Run:
```bash
bun add -d @tauri-apps/cli
```

然後編輯 `package.json` 的 `scripts`,在 `"test": "bun test"` 後加一行:
```json
    "test": "bun test",
    "tauri": "tauri"
```

- [ ] **Step 2: 忽略 Rust build 產物**

在 `.gitignore` 末尾加:
```
# Tauri (Rust build artifacts)
src-tauri/target/
```

- [ ] **Step 3: Rust crate 設定**

Create `src-tauri/Cargo.toml`:
```toml
[package]
name = "dbcli-gui"
version = "0.1.0"
edition = "2021"
description = "dbcli-gui desktop shell"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[[bin]]
name = "dbcli-gui"
path = "src/main.rs"
```

- [ ] **Step 4: build script**

Create `src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build();
}
```

- [ ] **Step 5: Tauri 設定(CSP + frontendDist + 空 windows)**

Create `src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "dbcli-gui",
  "version": "0.1.0",
  "identifier": "com.carllee.dbcligui",
  "build": {
    "frontendDist": "../dist",
    "beforeDevCommand": "bun run build",
    "beforeBuildCommand": "bun run build"
  },
  "app": {
    "windows": [],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost http://localhost:* http://127.0.0.1:*; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:"
    }
  },
  "bundle": {
    "active": false,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 6: 進入點(只開窗,不接 sidecar)**

Create `src-tauri/src/main.rs`:
```rust
use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("dbcli-gui")
                .inner_size(1200.0, 800.0)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

- [ ] **Step 7: placeholder 圖示來源 PNG 產生器**

Create `scripts/make-icon.ts`(用 Bun 內建 `node:zlib`,零外部相依,輸出 1024×1024 純色 PNG):
```ts
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const W = 1024
const H = 1024
const [R, G, B] = [0x2b, 0x6c, 0xb0] // dbcli 藍

// raw scanlines: each row = 1 filter byte (0=None) + W*3 RGB bytes
const raw = Buffer.alloc(H * (1 + W * 3))
for (let y = 0; y < H; y++) {
  const off = y * (1 + W * 3)
  raw[off] = 0
  for (let x = 0; x < W; x++) {
    const p = off + 1 + x * 3
    raw[p] = R
    raw[p + 1] = G
    raw[p + 2] = B
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 2 // colour type: truecolour RGB
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync('app-icon.png', png)
console.log('wrote app-icon.png')
```

- [ ] **Step 8: 產生來源 PNG 並用 Tauri 生成完整圖示集**

`src-tauri/` 已於 Step 3-6 建好,此時 `tauri icon` 才能定位輸出目錄。Run:
```bash
bun run scripts/make-icon.ts
bunx tauri icon app-icon.png
rm app-icon.png
```
Expected: 終端印出 `wrote app-icon.png`,接著 Tauri 在 `src-tauri/icons/` 產出 `32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.icns`、`icon.ico`、`icon.png` 等檔(對應 `tauri.conf.json` 的 `bundle.icon`)。

- [ ] **Step 9: 確保前端已 build**

Run:
```bash
bun run build
```
Expected: `built N files to ./dist`(`dist/index.html` 與 `chunk-*.js/.css` 存在)。

- [ ] **Step 10: 手動驗證 — 開窗 + 載入前端 + 資產不被 CSP 擋**

Run:
```bash
bun run tauri dev
```
Expected(首次會編譯 Rust,需數分鐘):
- 開出標題為 `dbcli-gui` 的原生視窗,**顯示 React 前端**(三欄 shell,非空白)。
- 因尚未接 sidecar,前端會嘗試 `fetch` 失敗 → 顯示 ErrorBanner(屬預期)。
- 開啟 webview devtools(右鍵 → Inspect,dev 模式預設可用),Console **不應出現 CSP 把 `chunk-*.js`/CSS/字型擋掉的錯誤**;若 fetch 失敗訊息是 connection refused 而非 `Refused to connect ... Content Security Policy`,代表 CSP connect-src 設定正確。

確認後 `Ctrl+C` 結束。

- [ ] **Step 11: Commit**

```bash
git add package.json bun.lock .gitignore scripts/make-icon.ts src-tauri/
git commit -m "feat: [shell] Tauri v2 骨架 — 開窗載入前端 + CSP 放行 localhost"
```

---

## Task 2: 前端 `readConnParams` 支援注入全域(TDD)

**Files:**
- Test: `tests/frontend/client.test.ts`
- Modify: `src/api/client.ts:19-23`

- [ ] **Step 1: 寫失敗測試**

在 `tests/frontend/client.test.ts` 既有的 `readConnParams` 測試(第 22-24 行)之後,新增:
```ts
test('readConnParams prefers the injected window.__DBCLI__ global over the query string', () => {
  ;(globalThis as { __DBCLI__?: unknown }).__DBCLI__ = { port: 9999, token: 'injected' }
  try {
    expect(readConnParams('?port=1&token=fromquery')).toEqual({ port: '9999', token: 'injected' })
  } finally {
    delete (globalThis as { __DBCLI__?: unknown }).__DBCLI__
  }
})

test('readConnParams falls back to the query string when no global is injected', () => {
  expect(readConnParams('?port=1234&token=abc')).toEqual({ port: '1234', token: 'abc' })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run:
```bash
bun test tests/frontend/client.test.ts
```
Expected: 新的 `prefers the injected window.__DBCLI__` 測試 FAIL(目前 `readConnParams` 只讀 query,回傳 `{ port: '1', token: 'fromquery' }`)。

- [ ] **Step 3: 最小實作**

把 `src/api/client.ts` 第 19-23 行的 `readConnParams` 替換為:
```ts
interface InjectedConnParams {
  port?: number | string
  token?: string
}

/**
 * Read port + token. The Tauri shell injects `window.__DBCLI__` before any page
 * script runs; the dev harness uses the URL query string. Global wins when present.
 */
export function readConnParams(search: string = location.search): { port: string; token: string } {
  const injected = (globalThis as { __DBCLI__?: InjectedConnParams }).__DBCLI__
  if (injected?.port != null && injected?.token != null) {
    return { port: String(injected.port), token: String(injected.token) }
  }
  const params = new URLSearchParams(search)
  return { port: params.get('port') ?? '', token: params.get('token') ?? '' }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run:
```bash
bun test tests/frontend/client.test.ts
```
Expected: 全數 PASS(含兩個新案)。

- [ ] **Step 5: 全套件無回歸 + typecheck**

Run:
```bash
bun test
bunx tsc --noEmit
```
Expected: `bun test` 119 pass(原 117 + 2),`tsc` 無輸出。

- [ ] **Step 6: Commit**

```bash
git add src/api/client.ts tests/frontend/client.test.ts
git commit -m "feat: [frontend] readConnParams 優先讀 Tauri 注入的 window.__DBCLI__"
```

---

## Task 3: `parse_ready_line` 純函式(Rust TDD)

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: 寫測試 + 最小 stub(先紅)**

把 `src-tauri/src/main.rs` 改成(暫時保留 Task 1 的 `main`,在其上方加入型別、stub 與測試):
```rust
use serde::Deserialize;
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Deserialize, PartialEq)]
struct ReadyLine {
    port: u16,
    token: String,
}

fn parse_ready_line(_line: &str) -> Result<ReadyLine, String> {
    Err("unimplemented".to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("dbcli-gui")
                .inner_size(1200.0, 800.0)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_valid_ready_line() {
        let got = parse_ready_line(r#"{"ready":true,"port":54321,"token":"deadbeef"}"#).unwrap();
        assert_eq!(got, ReadyLine { port: 54321, token: "deadbeef".to_string() });
    }

    #[test]
    fn rejects_a_line_missing_fields() {
        assert!(parse_ready_line(r#"{"ready":true,"port":54321}"#).is_err());
    }

    #[test]
    fn rejects_non_json() {
        assert!(parse_ready_line("not json at all").is_err());
    }
}
```

- [ ] **Step 2: 跑測試確認失敗**

Run:
```bash
cd src-tauri && cargo test ; cd ..
```
Expected: `parses_a_valid_ready_line` FAIL(stub 回傳 `Err`);另兩案 PASS。

- [ ] **Step 3: 實作 `parse_ready_line`**

把 stub 替換為:
```rust
fn parse_ready_line(line: &str) -> Result<ReadyLine, String> {
    serde_json::from_str::<ReadyLine>(line)
        .map_err(|e| format!("invalid sidecar ready line ({e}): {line}"))
}
```

- [ ] **Step 4: 跑測試確認通過**

Run:
```bash
cd src-tauri && cargo test ; cd ..
```
Expected: 三案全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: [shell] parse_ready_line 解析 sidecar ready-line(TDD)"
```

---

## Task 4: 接上 sidecar 生命週期(spawn / 注入 / 收尾)

**Files:**
- Modify: `src-tauri/src/main.rs`(整檔替換為最終版,保留 Task 3 的測試模組)

- [ ] **Step 1: 整檔替換 `src-tauri/src/main.rs`**

```rust
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Deserialize, PartialEq)]
struct ReadyLine {
    port: u16,
    token: String,
}

fn parse_ready_line(line: &str) -> Result<ReadyLine, String> {
    serde_json::from_str::<ReadyLine>(line)
        .map_err(|e| format!("invalid sidecar ready line ({e}): {line}"))
}

/// Holds the spawned sidecar child so we can kill it on exit.
struct SidecarState(Mutex<Option<Child>>);

/// The dbcli-gui repo root = parent of the `src-tauri` crate dir. Dev-only resolution.
fn repo_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri always has a parent directory")
        .to_path_buf()
}

fn main() {
    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            // 1. spawn the sidecar from the repo root so it finds ./sidecar and ./.dbcli
            let mut child = Command::new("bun")
                .args(["run", "sidecar/index.ts"])
                .current_dir(repo_root())
                .stdout(Stdio::piped())
                .spawn()
                .map_err(|e| format!("failed to spawn sidecar: {e}"))?;

            // 2. read the first stdout line: {"ready":true,"port":N,"token":"..."}
            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| "sidecar stdout was not piped".to_string())?;
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            reader
                .read_line(&mut line)
                .map_err(|e| format!("failed to read sidecar ready line: {e}"))?;
            let ready = parse_ready_line(line.trim())?;

            // keep draining stdout so a full pipe never blocks the sidecar
            thread::spawn(move || {
                let mut sink = String::new();
                while reader.read_line(&mut sink).map(|n| n > 0).unwrap_or(false) {
                    sink.clear();
                }
            });

            // 3. store the child for kill-on-exit
            app.state::<SidecarState>().0.lock().unwrap().replace(child);

            // 4. if the sidecar dies on its own, take the app down too
            let handle = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_millis(500));
                let state = handle.state::<SidecarState>();
                let mut guard = state.0.lock().unwrap();
                match guard.as_mut() {
                    Some(c) => match c.try_wait() {
                        Ok(Some(_)) | Err(_) => {
                            drop(guard);
                            handle.exit(0);
                            break;
                        }
                        Ok(None) => {}
                    },
                    None => break,
                }
            });

            // 5. open the window, injecting port/token before any page script runs
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("dbcli-gui")
                .inner_size(1200.0, 800.0)
                .initialization_script(&format!(
                    "window.__DBCLI__ = {{ port: {}, token: {:?} }};",
                    ready.port, ready.token
                ))
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build tauri app")
        .run(|handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(mut child) =
                    handle.state::<SidecarState>().0.lock().unwrap().take()
                {
                    let _ = child.kill();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_valid_ready_line() {
        let got = parse_ready_line(r#"{"ready":true,"port":54321,"token":"deadbeef"}"#).unwrap();
        assert_eq!(got, ReadyLine { port: 54321, token: "deadbeef".to_string() });
    }

    #[test]
    fn rejects_a_line_missing_fields() {
        assert!(parse_ready_line(r#"{"ready":true,"port":54321}"#).is_err());
    }

    #[test]
    fn rejects_non_json() {
        assert!(parse_ready_line("not json at all").is_err());
    }
}
```

- [ ] **Step 2: 單元測試仍綠**

Run:
```bash
cd src-tauri && cargo test ; cd ..
```
Expected: 三案全 PASS(整檔替換未動測試)。

- [ ] **Step 3: 手動 smoke — 完整查詢流程**

前置:確認專案根目錄有可用的 `.dbcli` 連線設定(本 repo 已有 `.dbcli/`)。

Run:
```bash
bun run tauri dev
```
Expected:
- 視窗開啟,Sidebar **列出 `.dbcli` 內的連線**(代表前端已透過注入的 port/token 成功 `fetch` 到 sidecar,CSP connect-src 正確)。
- 點連線 → 展開 schema 樹 → 在 Editor 寫 `SELECT 1`(或某表查詢)→ `Cmd+Enter` → ResultGrid 顯示結果。
- 測 ExportButton 下載 CSV/JSON。

若 Sidebar 出現 CSP 連線錯誤,回到 `tauri.conf.json` 的 `connect-src` 確認含 `http://localhost:*`。

- [ ] **Step 4: 手動驗證 — 生命週期收尾**

- 關閉視窗後,另開終端執行 `pgrep -f "sidecar/index.ts"`,**應無輸出**(無孤兒程序)。
- 重新 `bun run tauri dev`,在另一終端 `pkill -f "sidecar/index.ts"` 殺掉 sidecar → **app 視窗應自動關閉**(monitor thread 觸發 `exit`)。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: [shell] spawn sidecar、注入 window.__DBCLI__、視窗/程序生命週期收尾"
```

---

## Task 5: README + 最終驗收

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 新增「桌面開發(Tauri)」段落**

在 `README.md` 既有的 dev/build 使用說明之後,加入:
```markdown
## 桌面開發(Tauri 殼)

前置:已安裝 Rust 工具鏈(`cargo`)。

\`\`\`bash
bun install
bun run tauri dev      # 編譯 Rust 殼、build 前端、開原生視窗
\`\`\`

Tauri 殼會自動 spawn `bun run sidecar/index.ts`,讀其 ready-line 取得隨機 port 與
token,並在開窗前以 `window.__DBCLI__` 注入給前端;關閉視窗會一併收掉 sidecar。

範圍說明:本階段僅供本機開發(`tauri dev`)。可散佈打包(`.app`/`.dmg`、簽章、notarize)
與 health 監控/重啟 UI 為後續工作。
```
(註:上面 code fence 內的 `\`\`\`` 寫入時改為真正的三個反引號。)

- [ ] **Step 2: 前端全套件綠**

Run:
```bash
bun test
```
Expected: 119 pass / 0 fail。

- [ ] **Step 3: Rust 單元綠**

Run:
```bash
cd src-tauri && cargo test ; cd ..
```
Expected: 3 passed。

- [ ] **Step 4: typecheck 綠**

Run:
```bash
bunx tsc --noEmit
```
Expected: 無輸出。

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: [shell] README 新增 Tauri 桌面開發說明"
```

---

## 完成定義(對照 spec §8 驗收標準)

- [ ] `bun run tauri dev` 開出原生視窗顯示 React 前端(Task 1 Step 10 / Task 4 Step 3)。
- [ ] 前端成功 fetch sidecar、Sidebar 列出 `.dbcli` 連線(Task 4 Step 3)。
- [ ] 能開連線、跑查詢、看結果、匯出(Task 4 Step 3)。
- [ ] 關窗無孤兒 sidecar;sidecar 死亡時 app 退出(Task 4 Step 4)。
- [ ] `cargo test` 與 `bun test` 皆綠(Task 5)。
