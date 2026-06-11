# 查詢結果表格可讀性強化 — 設計文件

> 狀態:設計定稿,待寫實作計畫。
> 範圍:只改善任意 SQL 查詢結果面板 `ResultGrid`;不改後端 API、不改資料表內容頁籤 `TableBrowser`、不改查詢執行流程。
> 目標:提升大量查詢結果的掃描性、特殊值辨識性、篩選狀態可理解性,同時保持現有搜尋、排序、虛擬捲動與 cell 詳情行為。

## 目標

讓查詢結果表格更容易閱讀與比對。使用者執行任意 SQL 後,應能快速看出目前顯示幾筆、是否被 filter 篩選、每列位置、特殊值是 `NULL` 還是空字串,以及數字、布林、JSON 類資料的大致型態。

## 已確認決策

1. **先聚焦查詢結果表格**:`ResultGrid` 是本輪主要修改面,不擴張到 `TableBrowser`。
2. **保留既有資料互動**:搜尋、欄位排序、虛擬捲動、點 cell 開 `CellDetailModal` 都必須維持。
3. **強化辨識,不新增資料語意**:前端只根據 JavaScript 值型態和目前欄位/列狀態做視覺呈現,不推論資料庫 schema 型別。
4. **保持工具型密度**:不做卡片式結果、不放大行高到影響資料密度,以清楚分隔與穩定尺寸提升閱讀。
5. **淺深色一致**:沿用 `DESIGN.md` 的 slate/blue 色系與 Tailwind dark variant。

## 元件設計

### ResultGrid 外框

- 上方搜尋列保留,但增加結果摘要:
  - 無 filter:顯示 `共 N 列`。
  - 有 filter:顯示 `顯示 F / 共 N 列`。
- footer 保留耗時資訊,並同步呈現目前可見結果摘要,避免捲動到底部才知道狀態。
- 無結果狀態分兩種:
  - 查詢本身回傳 0 列:`查詢傳回 0 筆資料`。
  - filter 後無結果:`沒有符合「query」的資料`。

### 表格閱讀性

- 加入固定寬度列號欄:
  - 顯示結果中的 1-based row number。
  - 與資料欄位用較淡背景區分。
  - 不參與排序與 cell detail。
- 表頭保持 sticky,並加入更明確的底線與陰影,讓大量捲動時欄位仍容易辨識。
- 資料列加入低對比斑馬紋與 hover 高亮,提升橫向掃描穩定性。
- row height 維持固定,避免虛擬捲動計算失準。

### Cell Typed Rendering

建立 `renderCellContent(value)` 之類的本地 helper,只服務 `ResultGrid`:

- `null` / `undefined`:顯示低彩度 `NULL` pill,避免看起來像空白。
- 空字串:顯示 `""` 或 `empty` pill,與 `NULL` 區分。
- boolean:顯示 `true` / `false` badge。
- number:使用 tabular number / 右側視覺對齊樣式,便於比較數值。
- object / array:顯示單行 JSON preview,長內容截斷;點擊 cell 仍開完整 detail modal。
- 其他字串:保留單行 truncation,避免破壞表格密度。

### 可及性與互動

- 搜尋 input 的 accessible name 維持 `搜尋結果`,確保既有測試與鍵盤操作不退化。
- 表頭排序維持 keyboard Enter/Space 操作與 `aria-sort`。
- 列號欄使用非互動 cell,避免讓使用者誤以為可排序或可打開詳情。
- 特殊值 badge 必須是文字可讀,不只靠顏色。

## 測試策略

- 更新 `tests/frontend/ResultGrid.test.tsx`:
  - 確認列號欄渲染。
  - 確認 `NULL`、空字串、boolean、object preview 的辨識文字。
  - 確認 filter 時顯示 `顯示 F / 共 N 列`。
  - 確認 filter 後 0 筆與查詢本身 0 筆的空狀態不同。
  - 確認點擊資料 cell 仍開 detail modal。
  - 確認大量結果仍只渲染 virtualized window。
- 驗證命令:
  - `bun test tests/frontend/ResultGrid.test.tsx`
  - 若改動牽涉共用型別或 build 風險,再跑 `bun test` 或 `bun run build`。

## 非目標

- 不新增欄位顯示/隱藏、欄寬拖曳、欄位 pinning 或匯出格式變更。
- 不把相同樣式抽成共用 DataGrid 元件;等 `TableBrowser` 也要統一時再抽。
- 不推論資料庫欄位 schema 型別,例如 date/time、decimal、enum。
- 不改 sidecar query route 或 `QueryResultDto` 結構。
