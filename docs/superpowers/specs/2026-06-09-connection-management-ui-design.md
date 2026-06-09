# v2 ‧ 連線管理 UI — 設計文件

> 狀態:設計定稿,待寫實作計畫。
> 範圍:dbcli-gui v2 的第一塊子系統「連線管理 UI」。其餘 v2 子系統(資料編輯、ER 圖、串流匯出、可散佈打包、health/重啟 UI)各自另走 spec → plan → 實作。

## 目標

讓使用者在 GUI 內**新增 / 編輯 / 刪除 / 測試 / 設預設**資料庫連線,並把結果安全寫回 dbcli 的 v2 多連線設定。橫跨兩個 repo:在上游 `@carllee1983/dbcli` 補連線寫入的公開 API,在 dbcli-gui 加 sidecar 路由與前端表單。

## 已確認決策(腦力激盪結論)

1. **範圍**:完整 CRUD + 測試連線 + 設預設。目標 v2 多連線格式;v1 單連線專案在使用者要新增/編輯連線時自動 migrate 成 v2。權限(permission)與 blacklist 的 GUI 設定**不在本期**(留待資料編輯子系統)。
2. **寫設定策略**:**上游 core 補 writer**(維護者本人)。所有設定格式知識(v2 schema、`$env` 命名慣例、binding 路徑、env 檔位置、v1→v2 轉換)下沉到 dbcli core;sidecar 維持薄。
3. **表單輸入**:結構化欄位;第一版僅 SQL 三系統(mysql / postgres / mariadb)。Mongo / Redis / Elasticsearch 留下一輪。
4. **密碼編輯**:留白 = 不變。真實 secret 一律不回傳前端 webview。
5. **表單形態**:置中 Modal(沿用既有 `CellDetailModal` 的 glassmorphism 風格)。

## 架構(跨 2 repo,3 層)

```
┌─ dbcli (上游, 維護者本人) ─────────────────────────┐
│  src/core/public.ts        ← 擴充公開 barrel        │
│  src/core/config-v2.ts /                            │
│  src/core/config-binding.ts(或新 mutations 模組)   │
│    既有: writeV2Config / resolveConfigStoragePath   │
│    新增: upsertConnection / removeConnection /       │
│          setDefaultConnection / migrateV1ToV2 /      │
│          writeConnectionSecret / envVarNameFor       │
│  → bun run build → 發新版 (預計 1.30.0)            │
└─────────────────────────────────────────────────────┘
                 │ import @carllee1983/dbcli/core
┌─ dbcli-gui sidecar ─────────────────────────────────┐
│  routes/connections.ts ← 擴充                        │
│    POST /connections/create / update / delete        │
│    POST /connections/test (不寫,只 ping)            │
│    POST /connections/set-default                     │
│    GET  /connections/get (回欄位,secret 遮蔽)       │
│  shared/schemas.ts ← 加 body schema                  │
└─────────────────────────────────────────────────────┘
                 │ fetch (127.0.0.1, bearer)
┌─ dbcli-gui 前端 ────────────────────────────────────┐
│  views/Sidebar.tsx「連線列表」+ 鈕 / 每列 hover ✎🗑 │
│  components/ConnectionFormModal.tsx (置中 modal)     │
│  hooks/useConnections.ts ← 擴充 CRUD + test          │
│  api/client.ts + api/types.ts ← 加呼叫與型別         │
└─────────────────────────────────────────────────────┘
```

**核心職責邊界**:設定格式知識全部留在 dbcli core;sidecar 只做 read-modify-write 編排與連線測試;前端只做表單與呼叫。這是「上游補 writer」要換取的好處——格式不 drift。

## dbcli core 公開 API 新增

在 `src/core/public.ts` 補匯出;mutation helper 為**純函式**(吃 `DbcliConfigV2` 回新 config,符合 immutability 規則),只有寫檔函式真正碰檔。

```ts
// 既有,補匯出
writeV2Config(storagePath: string, config: DbcliConfigV2): Promise<void>
resolveConfigStoragePath(projectPath: string): Promise<string>

// 新增 — 純函式(immutable,回新 config 物件)
type ConnectionInput = {
  name: string
  system: 'mysql' | 'postgres' | 'mariadb'
  host: string
  port: number
  user: string
  database: string
  // password 不在此 — 走 secret 路徑
}
upsertConnection(config: DbcliConfigV2, input: ConnectionInput): DbcliConfigV2  // 新增或就地覆寫同名
removeConnection(config: DbcliConfigV2, name: string): DbcliConfigV2
setDefaultConnection(config: DbcliConfigV2, name: string): DbcliConfigV2
migrateV1ToV2(v1: DbcliConfig): DbcliConfigV2                                   // v1 → 單一 'default' v2

// 新增 — secret 寫入(碰 env 檔);命名慣例封在 core
envVarNameFor(connName: string, field: 'password'): string                     // e.g. DBCLI_STAGING_PASSWORD
writeConnectionSecret(storagePath: string, connName: string,
                      field: 'password', value: string): Promise<void>
```

**密碼寫入流程**(建立/更新且使用者有填密碼時):
1. `upsertConnection` 產 config,password 設成 `{ $env: envVarNameFor(name, 'password') }`
2. `writeConnectionSecret(...)` 把真值寫進該連線 env 檔
3. `writeV2Config(...)` 寫 config.json

**讀取(GET /connections/get)**:回 host / port / user / database / system;**password 不回**(前端「留白=不變」)。

### 最高優先未知點(plan 第一步以 spike 釘死)

**writer 寫的 env 檔位置必須 = reader 讀的位置。** 既有 reader 端有 `loadConnectionEnv` 與 v2 connection 的 `envFile` 欄位。需先確認 v2 secret 走的是 per-connection `envFile` 還是專案共用 `.env.local`,並讓 `writeConnectionSecret` 寫的路徑與 `envVarNameFor` 的命名,能被既有 `resolveConnection` / `loadConnectionEnv` 正確讀回。round-trip 整合測必須先綠才往下做。

## sidecar 路由

擴充 `sidecar/routes/connections.ts`,全部走既有 `guard(token)` + zod body 驗證 + `{ error: { code, message } }` 封裝。新增 body schema 於 `shared/schemas.ts`(`ConnectionInputBody`、`ConnectionNameBody`、`TestConnectionBody`)。

| 路由 | 行為 | 邊界 |
|------|------|------|
| `POST /connections/create` | 驗 body → `upsertConnection` + `writeConnectionSecret` + `writeV2Config` | 名稱衝突 → `CONFLICT` |
| `POST /connections/update` | 同上;password 留白則不動 secret | 不存在 → `NOT_FOUND` |
| `POST /connections/delete` | `removeConnection` + `writeV2Config`(+清 env 值) | 刪預設 → 擋或自動改派(見下) |
| `POST /connections/set-default` | `setDefaultConnection` + `writeV2Config` | 不存在 → `NOT_FOUND` |
| `POST /connections/test` | `AdapterFactory` 組臨時 adapter → `connect` → `testConnection` → `disconnect` | **不寫檔**;回 `{ ok, ms }` 或語意化錯誤碼 |
| `GET /connections/get?name=` | 回欄位,**password 省略** | 不存在 → `NOT_FOUND` |

- **v1→v2 migration 接點**:`create` 時若 `detectConfigVersion` === 1 → 先 `migrateV1ToV2` 再 upsert,一次 `writeV2Config` 落地。
- **原子寫(硬性要求)**:寫設定採 write-temp-then-rename,避免中途崩潰毀掉使用者真實設定庫;寫前可留一份備份。
- **刪預設策略**:刪掉目前的預設連線時,若仍有其他連線則自動把第一條設為預設;若刪到最後一條則允許。
- **測試連線的 adapter 生命週期**:test 用「未存檔的表單值」臨時組 adapter,與連線池(持久連線)分離,測完即 `disconnect`,不進池。
- **寫入不自動測試**:`create` / `update` 只寫設定,不強制先測試連線;測試是使用者在表單按「測試連線」觸發的獨立動作(打 `/connections/test`)。允許先存後測。

## 前端

- **入口**:`Sidebar`「連線列表」標題列加 `+`;每列 hover 出 ✎ / 🗑(沿用既有 group-hover 模式)。
- **`components/ConnectionFormModal.tsx`**:置中 modal(沿用 `CellDetailModal` 的 glassmorphism backdrop)。欄位:名稱、系統下拉(mysql / postgres / mariadb)、host、port、user、password(留白=不變)、database、設為預設 checkbox。內含「測試連線」鈕 → 打 `/connections/test`,就地顯示成功(✓ ms)/失敗(錯誤訊息)。
- **`hooks/useConnections.ts`**:擴充 `create / update / remove / setDefault / test`;成功後 refetch 連線列表;錯誤走既有 error channel。
- **`api/client.ts` + `api/types.ts`**:加對應方法與型別。
- **刪除確認**:小 confirm(刪預設時警告)。
- **狀態回饋**:寫入中 disable + spinner(沿用 `Spinner`)。

## 測試策略(守 80% + TDD)

- **core(dbcli repo)**:`upsertConnection` / `removeConnection` / `setDefaultConnection` / `migrateV1ToV2` / `envVarNameFor` 純函式單元測;`writeV2Config` + `writeConnectionSecret` + 讀回 round-trip 整合測(temp dir)。
- **sidecar**:每路由整合測,沿用既有假 adapter + temp `.dbcli`;斷言寫檔可被 reader 讀回、secret 不外洩、原子寫、衝突 / NOT_FOUND / 刪預設等邊界。
- **前端**:`ConnectionFormModal` 元件測(留白=不變、測試連線成功/失敗 UI);`useConnections` CRUD hook 測。
- **E2E**:新旅程 `tests/e2e/journeys/connections.e2e.ts`——新增連線 → 測試 → 出現在列表 → 設預設 → 編輯 → 刪除;fixture sidecar 用 temp 設定目錄。

## 風險與對策

| 風險 | 等級 | 對策 |
|------|------|------|
| 毀損使用者真實設定庫 | 高 | 原子寫(temp+rename)、寫前備份、core round-trip 測先綠 |
| writer 寫的 env 位置 ≠ reader 讀的位置 | 高 | plan 第一步 spike 釘死路徑與命名慣例 |
| 跨 repo 發版相依 | 中 | core 改動先合併發版(1.30.0),gui 再 bump 依賴;plan 分兩階段 |
| zod v3 對齊(README 已載明) | 低 | core 新型別沿用 zod v3 |

## 實作階段切分(供 writing-plans 參考)

1. **階段 A — dbcli core writer**(dbcli repo):新增純函式 mutation + 寫檔 + secret API,補 `public.ts` 匯出,round-trip 測綠,發版 1.30.0。
2. **階段 B — sidecar 路由**(dbcli-gui):bump dbcli 依賴,加 6 路由 + schema,整合測綠。
3. **階段 C — 前端**(dbcli-gui):`ConnectionFormModal` + Sidebar 入口 + `useConnections` 擴充 + client,元件/hook 測綠。
4. **階段 D — E2E + 文件**:`connections.e2e.ts`、README v2 段落、設計與計畫對齊。

## 不在本期範圍

- Mongo / Redis / Elasticsearch 連線表單(下一輪)
- 每連線 permission / blacklist 的 GUI 設定(資料編輯子系統)
- 原始 URI / 連線字串貼上輸入(可後續加「進階」選項)
- 其餘 v2 子系統(資料編輯、ER 圖、串流匯出、可散佈打包、health/重啟 UI)
