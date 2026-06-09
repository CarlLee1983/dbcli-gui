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
