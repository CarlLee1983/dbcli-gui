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

1. **Bun sidecar** (engine + local HTTP API) — independently testable with `bun test`. ← current
2. React frontend (builds against the sidecar).
3. Tauri shell (wires them together + packaging).

## Conventions

- **Runtime:** Bun (see `CLAUDE.md`). `Bun.serve()` for the local API; no express.
- **zod pinned to v3** (`^3.25.76`) to match `dbcli`'s zod major — `@carllee1983/dbcli/core`'s
  generated types reference `zod`, so a v4 skew would break consumer typechecks. Keep aligned.

## Dev

```bash
bun install
bun test            # sidecar tests (once present)
```
