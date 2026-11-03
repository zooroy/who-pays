# 誰付錢

朋友出國旅行用的多人分帳 PWA，採 React、Vite、TypeScript 與 Supabase，支援以旅程連結加入、原幣別記帳與結算。收據辨識規劃使用 Gemini。金額以整數最小貨幣單位儲存，目前支援 TWD、JPY。

## 開發需求

- Node.js 22.12 以上（本次驗證使用 26.10.0）與 npm。
- 已啟動的 OrbStack 或 Docker Desktop，且 `docker info` 能正常連線。
- Supabase CLI（本次驗證使用 2.120.0），須能執行 `supabase`。

## 本機開發

1. 取得專案，進入專案根目錄後安裝套件：

   ```sh
   npm ci
   ```

2. 啟動容器環境，再啟動 Supabase：

   ```sh
   docker info
   export SUPABASE_TELEMETRY_DISABLED=1
   supabase start
   ```

   專案已提交 `supabase init` 產生的設定，不需再次初始化。第一次啟動會下載容器映像；若 registry 暫時限流，等待後重試。停用 CLI telemetry 可避免受限執行環境嘗試寫入家目錄。`config.toml` 已啟用匿名登入。

3. 套用 migration（**會清除本機資料庫既有資料**，請勿對雲端使用 `--linked`）：

   ```sh
   supabase db reset
   supabase status
   ```

   Studio 位址為 http://127.0.0.1:54323，API 為 http://127.0.0.1:54321。

4. 設定前端環境變數：

   ```sh
   cp .env.example .env.local
   supabase status -o env
   ```

   將輸出的本機 `ANON_KEY` 貼到 `.env.local` 的 `VITE_SUPABASE_ANON_KEY`；`VITE_SUPABASE_URL` 保持本機預設值。不要把 `SERVICE_ROLE_KEY`、secret key 或 Gemini key 放進任何 `VITE_` 變數。

5. 啟動前端，開啟終端顯示的網址（預設 http://localhost:5173）：

   ```sh
   npm run dev
   ```

   修改環境變數後需重新啟動 Vite。結束開發時可執行 `supabase stop`。

目前資料庫的七張資料表均啟用 RLS，但尚未新增 policy，因此前端直接查詢資料表會得到空結果，直接寫入會被拒絕。RLS policy、Storage 與 Realtime publication 由後續任務提供；RPC 已自行檢查匿名登入身份與 `trip_access`。

## 測試與建置

```sh
npm test              # Vitest 純邏輯測試
npm run lint         # oxlint
npm run build        # TypeScript 檢查與正式建置
supabase test db      # 啟動 Supabase 並完成 db reset 後執行 pgTAP
```

SQL 測試在 transaction 內建立測試使用者，以 `authenticated` 角色及 JWT claims 呼叫 RPC，最後 rollback。尚無 RLS policy，因此資料完整性斷言切回 postgres 執行。

## RPC 契約

所有 RPC 僅授權 `authenticated` 執行，需先匿名登入取得 JWT。

- `create_trip(name, default_currency, member_name, avatar_id)` 回傳 `{ trip_id, share_token, member_id }`。
- `join_trip(share_token)` 回傳旅程 UUID；重複加入不會重複建立權限。
- `add_member(trip_id, name, avatar_id)` 回傳成員 UUID，需旅程存取權。
- `upsert_expense(payload)` 回傳支出 UUID，需旅程存取權。新增省略 `id`，修改傳入既有 `id`；修改為整筆替換，不是部分更新。`member_id` 是目前認領的成員，新增時寫入 `created_by` 與 `updated_by`，修改時保留原建立者。
- `delete_expense(expense_id)` 回傳 void，需旅程存取權；連帶刪除分攤及品項，不處理 Storage 照片。

`upsert_expense` payload 範例（UUID 請替換為 RPC 回傳值）：

```json
{
  "trip_id": "旅程 UUID",
  "member_id": "目前成員 UUID",
  "title": "晚餐",
  "amount": 3240,
  "currency": "JPY",
  "spent_on": "2026-11-03",
  "paid_by": "付款人成員 UUID",
  "split_member_ids": ["分攤成員 UUID"],
  "receipt_path": null,
  "receipt_raw": null,
  "items": [
    { "name": "ラーメン", "name_zh": "拉麵", "qty": 2, "unit_price": 980, "amount": 1960 }
  ]
}
```

`items` 可省略，視為空陣列；順序依陣列位置儲存（從 0 起算）。`receipt_path`、`receipt_raw` 可省略，修改時會清空。所有成員與支出的跨表關聯均以複合外鍵確保同一旅程。品項總額不必等於支出金額；依本次任務要求，品項小計與非 null 單價也必須大於 0。

前端可依 PostgreSQL 錯誤的 `code`、`message` 辨識：

| code | message | 意義 |
| --- | --- | --- |
| `42501` | `AUTH_REQUIRED` | 缺少使用者身份 |
| `42501` | `TRIP_ACCESS_DENIED` | 沒有旅程存取權（刪除不存在支出亦同） |
| `22023` | `NAME_REQUIRED` | 建立旅程時名稱或成員名稱為空 |
| `P0002` | `TRIP_NOT_FOUND` | 分享連結無效 |
| `P0001` | `AVATAR_TAKEN` | 頭像已被選走 |
| `22023` | `SPLITTERS_REQUIRED` | 未提供至少一位分攤者 |
| `22023` | `INVALID_MEMBER` | 目前成員不屬於此旅程 |
| `22023` | `INVALID_ITEMS` | 品項不是陣列 |
| `P0002` | `EXPENSE_NOT_FOUND` | 修改的支出不存在於指定旅程 |
| `23503` | 依外鍵約束 | 付款人或分攤者不屬於旅程 |
| `23514` | 依 check 約束 | 金額、幣別、頭像或名稱無效 |

任何 RPC 錯誤都會使該次呼叫的所有寫入回滾。
