# v2 ‧ 資料編輯子系統 — 設計文件

> 狀態:設計定稿,待寫實作計畫。
> 範圍:dbcli-gui v2 的子系統「資料編輯」。讓使用者在 GUI 內以行內編輯 / 新增 / 刪除的方式修改資料列,並安全寫回資料庫。橫跨兩個 repo:上游 `@carllee1983/dbcli` 補 row-mutation SQL builder,dbcli-gui 加 sidecar 寫入路由與前端表瀏覽/編輯 UI。
> 前置:延續「連線管理 UI」子系統(spec: docs/superpowers/specs/2026-06-09-connection-management-ui-design.md);core 已發佈 1.30.0。

## 目標

讓使用者在 GUI 內**瀏覽單一資料表**並對其資料列做**編輯 / 新增 / 刪除**,改動以「暫存 + 手動儲存」方式一次性(交易包裹)寫回 dbcli 所連的資料庫。所有 SQL 格式知識(識別字引號、placeholder 方言差異、mutation 語句組裝)下沉到 dbcli core;sidecar 維持薄(權限/blacklist 守門 + 交易編排);前端只做表瀏覽、暫存改動模型與儲存呼叫。

## 已確認決策(腦力激盪結論)

1. **資料來源模型**:**兩者都要** — 主走「專用表瀏覽模式」(由側欄點表進入,帶表名 + `getTableSchema` 主鍵,確知反寫目標);任意 SQL 結果則於**階段二**才偵測「單表 SELECT 含主鍵」後開放編輯。階段一只做表瀏覽,任意 SQL 結果維持唯讀。
2. **提交模型**:**暗放改動 + 手動儲存**。編輯 / 新增 / 刪除先累積為「待儲存變更」(視覺標記),按「儲存」才一次送出,並包在資料庫交易內(全成或全敗)。可預覽 / 取消。
3. **SQL 生成位置**:**下沉到 core**。在 `@carllee1983/dbcli` 新增 row-mutation builder(`quoteIdentifier` / `buildUpdate` / `buildInsert` / `buildDelete`),沿用 v2「格式知識在 core」哲學,進 core 既有測試套件,再發新版(預計 1.31.0;由維護者本人 `npm publish`)。
4. **編輯防呆**:**顯式「編輯模式」開關**。表瀏覽預設唯讀;按「編輯」才進入可改狀態。連線權限不足(`< read-write`)時開關 disable 並提示。

## 架構(跨 2 repo,3 層)

```
┌─ dbcli (上游, 維護者本人) ─────────────────────────────┐
│  src/core/row-mutation.ts ← 新模組(純函式 SQL builder) │
│    quoteIdentifier(dialect, name)   backtick vs "雙引號" │
│    buildUpdate / buildInsert / buildDelete               │
│      (dialect, table, …) → { sql, params }               │
│  src/core/public.ts ← 補匯出                             │
│  → bun run build → 發新版(預計 1.31.0)                 │
└─────────────────────────────────────────────────────────┘
                 │ import @carllee1983/dbcli/core
┌─ dbcli-gui sidecar ─────────────────────────────────────┐
│  routes/data.ts ← 新增                                   │
│    POST /data/mutate  批次 update/insert/delete(交易)   │
│  routes/connections.ts ← open/list 回應補 permission     │
│  shared/schemas.ts ← 加 MutateBody schema                │
└─────────────────────────────────────────────────────────┘
                 │ fetch (127.0.0.1, bearer)
┌─ dbcli-gui 前端 ────────────────────────────────────────┐
│  views/TableBrowser.tsx ← 表瀏覽 + 編輯模式             │
│  hooks/useDataEdit.ts   ← 暫存改動模型 + 儲存編排        │
│  api/client.ts + api/types.ts ← 加 mutate 呼叫與型別     │
└─────────────────────────────────────────────────────────┘
```

**核心職責邊界**:SQL 方言知識全部在 core;sidecar 只做權限/blacklist 守門與交易編排;前端只做表瀏覽、暫存改動與呼叫。

## dbcli core 新增 — row-mutation builder

新模組 `src/core/row-mutation.ts`,全為**純函式**(不碰 DB、不碰檔),回傳參數化的 `{ sql, params }`,由呼叫端交給 `adapter.execute(sql, params)`。

```ts
type Dialect = 'mysql' | 'mariadb' | 'postgresql'

// 識別字引號:mysql/mariadb → `name`;postgresql → "name"
quoteIdentifier(dialect: Dialect, name: string): string

// placeholder:mysql/mariadb → ?;postgresql → $1, $2, …
buildUpdate(dialect: Dialect, table: string,
            set: Record<string, unknown>,
            pk: Record<string, unknown>): { sql: string; params: unknown[] }
buildInsert(dialect: Dialect, table: string,
            values: Record<string, unknown>): { sql: string; params: unknown[] }
buildDelete(dialect: Dialect, table: string,
            pk: Record<string, unknown>): { sql: string; params: unknown[] }
```

- **方言差異只集中在此模組**:識別字引號、placeholder 編號風格。
- 全參數化(防 SQL injection)。`NULL` 值正確以參數綁定傳遞。
- 補進 `src/core/public.ts` 公開 barrel。

### 最高優先未知點(plan 第一步以 spike 釘死)

- **placeholder 與引號的方言正確性**:postgres 用 `$n` 且識別字 `"..."`;mysql/mariadb 用 `?` 且識別字 `` `...` ``。builder 必須對三方言各自正確,且能被既有 adapter `execute(sql, params)` 正確消費。round-trip(builder → adapter.execute → 讀回)整合測必須先綠。
- **保留字 / 特殊字元表名欄名**:引號需正確跳脫(雙寫引號字元)。

## sidecar 路由 — `POST /data/mutate`

新增 `sidecar/routes/data.ts`,沿用既有 `guard(token)` + zod body 驗證 + `{ error: { code, message } }` 封裝。新增 body schema 於 `shared/schemas.ts`。

**Body**:

```ts
{
  connectionId: string
  table: string
  ops: {
    updates: Array<{ pk: Record<string, unknown>; set: Record<string, unknown> }>
    inserts: Array<{ values: Record<string, unknown> }>
    deletes: Array<{ pk: Record<string, unknown> }>
  }
}
```

**處理流程**:

1. **連線存在**:`pool.get(connectionId)` 不存在 → `409 NOT_OPEN`。
2. **權限**:`entry.config` 的 permission `< read-write`(即 `query-only`)→ `403 FORBIDDEN`。(`read-write` / `data-admin` / `admin` 放行 DML。)
3. **blacklist 守門**:
   - 表被 `BlacklistManager.isTableBlacklisted` → 擋(`BlacklistError`)。
   - 任一 `set` / `values` 的 key 命中 `getBlacklistedColumns(table)` → 擋(不可繞過遮蔽寫入)。
4. **交易**:`adapter.execute('BEGIN')`(postgres/mysql/mariadb 皆支援)→ 依序處理 deletes → updates → inserts,每筆用 core builder 組 SQL + `adapter.execute(sql, params)`;任一步擲錯 → `ROLLBACK` 後回錯;全成 → `COMMIT`。
5. **樂觀並發**:每筆 update / delete 預期 `affectedRows === 1`;若為 0(列已被他人改/刪)或 > 1 → `ROLLBACK` + 回 `CONFLICT`。
6. **回應**:`{ ok: true, applied: { updated: n, inserted: n, deleted: n } }`。

**邊界**:

| 路由行為 | 邊界 |
|----------|------|
| 權限不足 | `FORBIDDEN` |
| 表 / 欄被 blacklist | `BlacklistError`(既有錯誤碼) |
| 並發衝突(affectedRows≠1) | `ROLLBACK` + `CONFLICT` |
| 交易中任何 DB 錯 | `ROLLBACK` + 語意化錯誤碼 |
| 空 ops(無任何改動) | `BAD_REQUEST` 或直接回 ok(無副作用) |

### connections 路由補強

`open` 與 `list` 回應補上連線的 `permission` 欄位(來源:`entry.config` / v2 connection 設定),供前端決定是否啟用「編輯模式」開關。`ConnectionSummary` 與 open 回應型別同步擴充。

## 前端

### 入口與表瀏覽(`views/TableBrowser.tsx`)

- 側欄點選表格 → 開「表瀏覽」(沿用既有分頁機制;tab 狀態新增 `browse?: { table: string; schema: TableSchemaDto }`)。
- 進入時:抓 `getTableSchema`(取主鍵與欄位)+ `SELECT * FROM <table> LIMIT n`;結果標記為可編輯來源(帶表名 + 主鍵)。
- 表格渲染沿用 `ResultGrid` 的虛擬捲動 / 排序 / 篩選;編輯能力為其可寫版(可抽共用或擴充)。

### 編輯模式與暫存改動(`hooks/useDataEdit.ts`)

- **編輯模式開關**:預設唯讀;按「編輯」進入可改。連線 permission `< read-write` 時 disable + 提示。
- **暫存改動模型**:
  - `updates: Map<rowKey, Record<field, newValue>>`
  - `inserts: Array<draftRow>`
  - `deletes: Set<rowKey>`
  - `rowKey` = 原始主鍵值序列化(穩定識別列)。
- **視覺標記**:改動列 黃、新增列 綠、刪除列 紅(刪除以刪除線保留可復原)。
- **NULL / 型別**:cell 編輯器區分空字串 vs `NULL`(顯式 set-NULL 動作);MVP 採文字輸入,送出由參數綁定處理型別。

### 儲存 / 取消

- 底部狀態列顯示「N 筆待儲存」。
- 「儲存」→ 一次組 `ops` 送 `POST /data/mutate`;成功 → 清暫存 + refetch 表;失敗 → 顯示錯誤、保留暫存。
- 「取消」→ 清暫存,回唯讀。

### api 層

- `api/client.ts` 加 `mutate(connectionId, table, ops)`。
- `api/types.ts` 加 `MutateOps` / `MutateResult` / `ConnectionSummary.permission` 等型別。

## 邊界情況彙整

| 情況 | 處理 |
|------|------|
| 表無主鍵 | 編輯模式 disable + banner「此表無主鍵,無法安全編輯」 |
| 改到主鍵欄本身 | WHERE 用**原始** PK 值,SET 含新 PK 值 |
| auto-increment / 有 default 的欄 | 新增列可留空略過(由 DB 補值) |
| 任意 SQL 結果 | 階段一唯讀;階段二才偵測單表 SELECT 後開放 |
| 並發衝突 | `affectedRows ≠ 1` → rollback + `CONFLICT` 提示 |
| blacklist 欄被嘗試寫入 | sidecar 擋下(前端本就不顯示該欄) |

## 測試策略(守 80% + TDD)

- **core(dbcli repo)**:`row-mutation` builder 純函式單元測 — 三方言 × {update, insert, delete} × {識別字引號跳脫、placeholder 編號、NULL 參數、複合主鍵};以及 builder → `adapter.execute` → 讀回的 round-trip 整合測(temp DB / 假 adapter)。
- **sidecar**:`/data/mutate` 整合測(假 adapter + temp `.dbcli`):權限擋(query-only → FORBIDDEN)、blacklist 表/欄擋、交易 rollback(中途錯)、並發衝突(affectedRows≠1)、批次 update+insert+delete 一次成功、空 ops。
- **前端**:`useDataEdit` 暫存模型測(累積/標記/合併同列多次改/取消/序列化 ops);`TableBrowser` 編輯模式切換、cell 改動標記、NULL 編輯、儲存呼叫 UI 測;權限不足 disable 測。
- **E2E**:`tests/e2e/journeys/data-edit.e2e.ts` — 瀏覽表 → 開編輯 → 改一格 / 新增一列 / 刪一列 → 儲存 → 重抓驗證落地;fixture sidecar 用 temp 設定目錄與可寫測試表。

## 風險與對策

| 風險 | 等級 | 對策 |
|------|------|------|
| 寫壞使用者真實資料 | 高 | 交易包裹(全成全敗)、樂觀並發(affectedRows 檢查)、顯式編輯模式防呆、儲存前可預覽暫存 |
| SQL 方言引號 / placeholder 錯誤 | 高 | builder 進 core 測試套件;plan 第一步 spike round-trip 釘死三方言 |
| 繞過 blacklist 寫入敏感欄 | 中 | sidecar 在組 SQL 前驗 set/values keys 不含 blacklisted 欄 |
| 跨 repo 發版相依 | 中 | core builder 先合併發版(1.31.0),gui 再 bump 依賴;plan 分階段 |
| 無主鍵表誤編輯 | 中 | 偵測無 PK 即 disable 編輯 + 明確提示 |

## 實作階段切分(供 writing-plans 參考)

1. **階段 A — core row-mutation builder**(dbcli repo):新增純函式 builder + `public.ts` 匯出,單元 + round-trip 測綠,發版 1.31.0(維護者 publish)。
2. **階段 B — sidecar `/data/mutate` 路由**(dbcli-gui):bump dbcli 依賴,加路由 + `MutateBody` schema + 權限/blacklist/交易/並發守門,整合測綠;connections open/list 補 `permission`。
3. **階段 C — 前端表瀏覽 + 編輯模式**(dbcli-gui):`TableBrowser` + `useDataEdit` 暫存模型 + 儲存/取消 + client/types,元件/hook 測綠。
4. **階段 D — 階段二 + E2E + 文件**:任意 SQL 單表偵測開放編輯、`data-edit.e2e.ts`、README v2 資料編輯段落、設計與計畫對齊。

## 不在本期範圍

- Mongo / Redis / Elasticsearch 的資料編輯(下一輪)
- 每連線 permission / blacklist 的 GUI **設定** UI(獨立子系統)
- DDL(改表結構:新增/刪除欄、改型別、索引)
- 巢狀 / JSON / 二進位欄位的專用編輯器(MVP 以文字 + NULL 切換處理)
- 原始 SQL 直接執行寫入(本子系統聚焦結構化行編輯)
