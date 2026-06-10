# v2 ‧ 表格多頁籤(Sequel Ace 式) — 設計文件

> 狀態:設計定稿,待寫實作計畫。
> 範圍:dbcli-gui v2 子系統「表格多頁籤」。點側欄資料表 → 開一個「表分頁」,內含子頁籤:結構 / 內容 / 關聯 / 觸發器 / 資訊,並提供「以此表開新查詢」按鈕。只動 dbcli-gui(sidecar 補方言查詢 + 前端 UI);dbcli core 不需改動。範圍限 SQL 三系統(MySQL / PostgreSQL / MariaDB)。
> 前置:延續「全域連線 + Workspace 切換」子系統(spec: 2026-06-10-global-workspace-design.md);資料編輯沿用既有 TableBrowser/mutate。

## 目標

把現在「點表只有單一可編輯內容視圖」升級為 Sequel Ace 式的多面向檢視:一張表 = 一個頂層分頁,分頁內最上方一排子頁籤切換**結構 / 內容 / 關聯 / 觸發器 / 資訊**,並可一鍵「以此表開新查詢」。沿用現有多查詢分頁工作流(TabBar 同時容納查詢分頁與表分頁),不打掉重練。

## 已確認決策(腦力激盪結論)

1. **版面模型 A**:表 = 一個頂層分頁,內含子頁籤;沿用現有 TabBar,可同時開多張表 + 多個查詢分頁。
2. **子頁籤集合**:結構 / 內容 / 關聯 / 觸發器 / 資訊(五項)。
3. **查詢不做子頁籤**:改為表分頁工具列上的「以此表開新查詢」按鈕,跳到頂層新查詢分頁(預填 `SELECT * FROM <表>`),避免與頂層查詢分頁重複實作。
4. **關聯含反向**:「關聯」同時顯示正向外鍵與反向「被誰參照」。
5. **側欄互動**:表名點一下 = 開/聚焦該表分頁(預設「結構」);鉛筆 ✎ = 開該表分頁並進「內容」編輯模式。
6. **lazy 載入**:結構/正向關聯用已載入的 `getTableSchema`;觸發器/資訊/反向關聯首次切入才抓,快取於 session。

## 架構(單 repo,2 層)

```
┌─ dbcli-gui sidecar ─────────────────────────────────────┐
│  dialect.ts ←新   依 connection.system 分流的方言 SQL    │
│                   (MySQL/MariaDB 共用、PostgreSQL 另寫)  │
│  routes/table-detail.ts ←新                              │
│    POST /schema/triggers   該表 trigger 清單             │
│    POST /schema/info       引擎/字元集/列數/大小/建立時間/CREATE│
│    POST /schema/relations  正向外鍵 + 反向被參照         │
│  shared/schemas.ts  加對應 request schema                │
│  (結構/內容/正向關聯複用既有 getTableSchema + data/mutate)│
└─────────────────────────────────────────────────────────┘
                 │ fetch (127.0.0.1, bearer)
┌─ dbcli-gui 前端 ────────────────────────────────────────┐
│  hooks/tabs-reducer.ts  BrowseSession → TableSession      │
│                         (加 subTab + 各子頁籤 lazy 快取) │
│  views/TableTab.tsx ←新  子頁籤列 + 「開新查詢」按鈕     │
│  views/table/StructureTab.tsx ←新                        │
│  views/table/RelationsTab.tsx ←新                        │
│  views/table/TriggersTab.tsx ←新                         │
│  views/table/InfoTab.tsx ←新                             │
│  views/TableBrowser.tsx  作為「內容」子頁籤複用          │
│  views/Sidebar.tsx + useApp.ts  openTableTab(table,subTab)│
│  api/client.ts + api/types.ts  加 triggers/info/relations │
└─────────────────────────────────────────────────────────┘
```

## 元件設計

### Sidecar:方言表(`dialect.ts`)
- 依 `entry.config.connection.system`(`mysql` / `mariadb` / `postgresql`)回傳對應 SQL builder。
- MySQL / MariaDB 共用一組;PostgreSQL 另一組。每個 builder 為純函式 `(table) => { sql, params }`,參數化避免注入,可單獨單元測。
- 三類查詢:
  - **triggers**:MySQL/MariaDB → `information_schema.TRIGGERS WHERE EVENT_OBJECT_TABLE = ?`(名稱/timing/event/statement);PostgreSQL → `information_schema.triggers`(或 `pg_trigger` 取 body)。
  - **info**:MySQL/MariaDB → `SHOW TABLE STATUS LIKE ?`(引擎/列數/大小/建立時間)+ `SHOW CREATE TABLE`(CREATE 語句);PostgreSQL → `pg_catalog` / `pg_stat_user_tables` 取等價欄位 + 組 view 定義或表結構摘要。
  - **relations**:正向由前端用已載入 schema.foreignKeys(免後端);反向 → `information_schema.KEY_COLUMN_USAGE` / `REFERENTIAL_CONSTRAINTS` 反查 `REFERENCED_TABLE_NAME = ?`(PostgreSQL 對應 catalog)。後端 `/schema/relations` 至少回反向;正向也可一併回以便集中渲染。

### Sidecar:路由(`routes/table-detail.ts`)
- 三端點皆:解析 body(connectionId + table)→ 取 pool entry(未開回 NOT_OPEN)→ **先過 `BlacklistManager`**(被保護的表直接擋,欄位層級結果過濾)→ 用 `dialect` 取 SQL → `entry.adapter.execute` → 整形回傳。
- 沿用既有 `toErrorBody` / `statusForCode`。
- View(`tableType==='view'`):triggers 多為空;info 回 view 定義而非 CREATE TABLE。

### 前端:session 模型(`tabs-reducer.ts`)
- `BrowseSession` 升級為 `TableSession`:
  ```ts
  interface TableSession {
    connectionId: string
    table: string
    schema: TableSchemaDto         // 結構 + 正向關聯來源(載表時抓)
    subTab: 'structure'|'content'|'relations'|'triggers'|'info'
    // lazy 快取:undefined = 尚未載入
    triggers?: TriggerDto[]
    info?: TableInfoDto
    relations?: RelationsDto        // 正向 + 反向
    // 內容子頁籤沿用現有 rows/fields/編輯狀態
    rows?: Array<Record<string, unknown>>
    fields?: string[]
  }
  ```
- `QuerySession` 維持原樣;頂層 session 以 `kind: 'query' | 'table'` 區分(取代現有 `browse` 欄位旗標),TabBar 同時渲染兩種。

### 前端:元件
- `TableTab.tsx`:子頁籤列(結構/內容/關聯/觸發器/資訊)+ 右側「以此表開新查詢」按鈕(呼叫 `tabs.openTab` 並預填 SQL)。切子頁籤時若該子頁籤資料未載入則觸發抓取。
- `StructureTab`:欄位表(名稱/型別/Null/預設/PK)+ 索引摘要,資料來自 `schema`。
- `RelationsTab`:正向外鍵(本欄 → 參照表.欄位)+ 反向「被誰參照」兩區塊。
- `TriggersTab`:trigger 清單(名稱/timing/event/statement)。
- `InfoTab`:引擎/字元集/列數估計/大小/建立時間 + CREATE 語句(等寬區塊,可複製)。
- 內容子頁籤 = 直接複用現有 `TableBrowser`(含編輯模式/暫存/儲存)。

### 前端:側欄互動
- `Sidebar` 的表名點擊 → `app.openTableTab(table, 'structure')`;鉛筆 ✎ → `app.openTableTab(table, 'content', { edit: true })`。
- `useApp.browseTable` 重構為 `openTableTab`:抓 `getTableSchema` 後 dispatch 開/聚焦表分頁(同表已開則聚焦並切到指定子頁籤,不重複開)。

## 資料流

1. 側欄點表 → `openTableTab` 抓 schema → 開表分頁(預設 structure,直接用 schema 渲染)。
2. 切到「觸發器/資訊/關聯」→ 若 session 對應快取為 undefined → 呼叫對應端點 → 寫回 session 快取 → 渲染。
3. 「以此表開新查詢」→ 開頂層查詢分頁,預填 `SELECT * FROM <表> LIMIT 100`。

## 錯誤處理

- 單一子頁籤抓取失敗(權限/方言不支援)→ 該子頁籤內顯示 inline 錯誤,不影響其他子頁籤與其快取。
- 被 blacklist 的表 → 後端擋下,子頁籤顯示「受保護」提示。
- View / 無 PK 表 → 觸發器/反向關聯多為空,顯示空狀態;內容子頁籤沿用既有「無主鍵不可編輯」防呆。

## 測試策略

- **單元(sidecar)**:`dialect` 三類 SQL builder × 三系統(快照式比對 SQL 與參數);`table-detail` 路由(NOT_OPEN、blacklist 擋下、正常整形)。
- **單元(前端)**:`tabs-reducer` 的 TableSession 開/聚焦/切子頁籤/快取寫入;各子頁籤元件 render(含空狀態與錯誤態)。
- **E2E**:點表開分頁 → 逐一切五個子頁籤(觸發器/資訊/關聯有 lazy 抓取)→「以此表開新查詢」開出預填查詢分頁。

## 非目標(YAGNI)

- 不做子頁籤內的 schema 編輯(改欄位/加索引/改 trigger);純檢視(內容除外,沿用既有資料編輯)。
- 不做 ER 圖視覺化(關聯僅以清單呈現)。
- 不支援非 SQL 系統(MongoDB/Redis/Elasticsearch)的表分頁。
- 不做查詢子頁籤(改按鈕開頂層查詢分頁)。
