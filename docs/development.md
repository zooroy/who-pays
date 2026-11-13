# 開發與部署

本機開發、測試、RPC 契約與部署步驟。專案介紹見 [README](../README.md)。

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

6. **本機擁有者帳號**：只有擁有者能建立旅程。在 `.env.local` 加上 `OWNER_EMAIL` 與 `OWNER_PASSWORD`（自訂的本機測試值），再用本機的 `SERVICE_ROLE_KEY` 執行一次（每次 `supabase db reset` 後要重跑）：

   ```sh
   SERVICE_ROLE_KEY=<supabase status -o env 的 SERVICE_ROLE_KEY> \
     node --env-file=.env.local scripts/create-local-owner.ts
   ```

   之後在 App 首頁按「擁有者登入」。腳本只接受本機網址；`SERVICE_ROLE_KEY` 只放在指令列，不要寫進任何 `VITE_` 變數。

八張資料表均啟用 RLS：成員只能讀取自己有 `trip_access` 的旅程，登記在 `app_owners` 的擁有者可讀取全部旅程（`app_owners` 本身不開放任何讀寫）；寫入一律經由 RPC（還款紀錄除外，可由成員直接新增與刪除）。收據照片存在私有的 `receipts` bucket，路徑為 `<trip_id>/<uuid>.jpg`，同樣依旅程權限控管。

### 收據辨識（本機）

```sh
cp supabase/functions/.env.example supabase/functions/.env   # 填入 GEMINI_API_KEY
supabase functions serve --env-file supabase/functions/.env
node --env-file=.env.local scripts/receipt-function-check.ts [收據照片.jpg]
```

請使用**未開啟付費**的 Google AI Studio 專案所產生的 key，才會套用免費額度；已開啟預付制的專案在餘額用完後會回 402。預設模型為 `gemini-3.6-flash`，可用 `GEMINI_MODEL` 覆寫。真實收據照片請放在 `test-receipts/`（已加入 `.gitignore`）。

## 測試與建置

```sh
npm test              # Vitest 純邏輯測試
npm run lint         # oxlint
npm run build        # TypeScript 檢查與正式建置
supabase test db      # 啟動 Supabase 並完成 db reset 後執行 pgTAP
```

SQL 測試在 transaction 內建立測試使用者，以 `authenticated` 角色及 JWT claims 呼叫 RPC 與查詢，最後 rollback。

`scripts/` 底下的檢查腳本會實際連線（本機或正式環境），以擁有者帳號建立旅程（需要 env 檔中的 `OWNER_EMAIL`、`OWNER_PASSWORD`），並建立少量匿名使用者（匿名登入每 IP 每小時上限 30 次）：

```sh
node --env-file=.env.local scripts/realtime-check.ts          # 即時同步只送給同旅程成員
node --env-file=.env.local scripts/realtime-delete-check.ts   # 刪除事件
node --env-file=.env.local scripts/storage-delete-check.ts    # 照片權限與刪除
node --env-file=.env.local scripts/receipt-function-check.ts  # parse-receipt 權限
```

把 `.env.local` 換成 `.env.production.local` 即可檢查正式環境。

## RPC 契約

所有 RPC 僅授權 `authenticated` 執行，需先登入（朋友為匿名登入，擁有者為 email 密碼登入）取得 JWT。

- `is_owner()` 回傳目前使用者是否登記在 `app_owners`。
- `create_trip(name, default_currency, member_name, avatar_id)` 回傳 `{ trip_id, share_token, member_id }`，只限擁有者；同時記錄建立者在此旅程的身份。
- `join_trip(share_token)` 回傳旅程 UUID；重複加入不會重複建立權限。
- `add_member(trip_id, name, avatar_id)` 回傳成員 UUID，需旅程存取權。
- `update_member(member_id, name, avatar_id)` 回傳 void，需該成員所屬旅程的存取權；旅程中任何成員都能修改任何成員的名字與頭像。成員不存在時同樣回 `TRIP_ACCESS_DENIED`，頭像已被其他成員使用時回 `AVATAR_TAKEN`。
- `upsert_expense(payload)` 回傳支出 UUID，需旅程存取權。新增省略 `id`，修改傳入既有 `id`；修改為整筆替換，不是部分更新。`member_id` 是目前認領的成員，新增時寫入 `created_by` 與 `updated_by`，修改時保留原建立者。
- `delete_expense(expense_id)` 回傳 void，需旅程存取權；連帶刪除分攤及品項，不處理 Storage 照片。
- `set_my_member(trip_id, member_id)` 回傳 void，需旅程存取權；記錄目前使用者在此旅程是哪位成員（`member_id` 傳 null 為清除）。讀取時直接查自己的 `trip_access.member_id`。
- `delete_member(member_id)` 回傳 void，需旅程存取權；成員有任何支出（付款、分攤、建立、修改）或還款紀錄時回 `MEMBER_HAS_RECORDS`，`details` 為相關紀錄數量。使用該身份的人 `member_id` 會變成 null。
- `delete_trip(trip_id)` 回傳 void，只限擁有者；刪除旅程與其所有資料。收據照片要由呼叫端先以 Storage API 刪除。
- `reset_share_token(trip_id)` 回傳新的分享碼，只限擁有者；舊分享碼立即失效，已加入的人保留存取權。

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

`items` 可省略，視為空陣列；順序依陣列位置儲存（從 0 起算）。`receipt_path`、`receipt_raw` 可省略，修改時會清空。所有成員與支出的跨表關聯均以複合外鍵確保同一旅程。品項總額不必等於支出金額；品項金額與單價可為 0 或負數（折扣、招待）。

前端可依 PostgreSQL 錯誤的 `code`、`message` 辨識：

| code | message | 意義 |
| --- | --- | --- |
| `42501` | `AUTH_REQUIRED` | 缺少使用者身份 |
| `42501` | `TRIP_ACCESS_DENIED` | 沒有旅程存取權（刪除不存在支出亦同） |
| `42501` | `OWNER_REQUIRED` | 只有擁有者能執行（建立、刪除旅程，重設分享連結） |
| `P0001` | `MEMBER_HAS_RECORDS` | 成員還有支出或還款紀錄，不能刪除 |
| `22023` | `NAME_REQUIRED` | 建立旅程時名稱或成員名稱為空 |
| `P0002` | `TRIP_NOT_FOUND` | 分享連結無效，或要刪除／重設的旅程不存在 |
| `P0001` | `AVATAR_TAKEN` | 頭像已被選走 |
| `22023` | `SPLITTERS_REQUIRED` | 未提供至少一位分攤者 |
| `22023` | `INVALID_MEMBER` | 目前成員不屬於此旅程 |
| `22023` | `INVALID_ITEMS` | 品項不是陣列 |
| `P0002` | `EXPENSE_NOT_FOUND` | 修改的支出不存在於指定旅程 |
| `23503` | 依外鍵約束 | 付款人或分攤者不屬於旅程 |
| `23514` | 依 check 約束 | 金額、幣別、頭像或名稱無效 |

任何 RPC 錯誤都會使該次呼叫的所有寫入回滾。

## 部署

正式環境：Supabase 專案在東京（`ap-northeast-1`），前端以 Cloudflare 靜態託管（Pages 現已併入 Workers static assets），網址 https://who-pays.who-pays.workers.dev 。

### 第一次部署

1. **Supabase**：在 Dashboard 建立專案（Region 選 Northeast Asia (Tokyo)，不要用 Auto），然後在本機的一般終端機登入並連結：

   ```sh
   supabase login                          # 需要互動式終端機
   supabase link --project-ref <project-ref>
   supabase db push                        # 套用所有 migrations
   ```

2. **開啟匿名登入**：Dashboard → Authentication → Sign In / Providers → User Signups，打開 **Allow anonymous sign-ins** 並儲存。「Allow new users to sign up」與 Email provider 也必須維持開啟（關掉會擋住匿名登入或擁有者的密碼登入）。

3. **擁有者帳號**：Dashboard → Authentication → Users → **Add user** → Create new user，輸入 email 與密碼並勾選 Auto Confirm User。再到 SQL Editor 執行（替換成你的 email）：

   ```sql
   insert into public.app_owners(user_id)
   select id from auth.users where email = '<擁有者 email>';
   ```

   有人自行註冊的 email 帳號不在這張表中，只會被當成一般朋友，沒有擁有者權限。

4. **Edge Function 與 secrets**：

   ```sh
   supabase secrets set --env-file supabase/functions/.env   # GEMINI_API_KEY（與選填的 GEMINI_MODEL）
   supabase functions deploy parse-receipt --use-api
   ```

5. **前端環境變數**：建立 `.env.production.local`（已被 `.gitignore` 排除）：

   ```sh
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key，可用 supabase projects api-keys 查詢>
   ```

   anon key 本來就會出現在瀏覽器中，是公開值；**不要**放 service role、secret key 或 Gemini key。

6. **前端**：在一般終端機執行一次 `npx wrangler login`，之後：

   ```sh
   npm run deploy      # 以 .env.production.local 建置，並上傳 dist/
   ```

   `wrangler.jsonc` 設定了 `single-page-application`，讓 `/t/<token>` 分享連結直接開啟 App。

7. **檢查正式環境**：用上面「測試與建置」的 `scripts/` 指令，把 `--env-file` 換成 `.env.production.local`。

### 之後更新

- 前端：`npm run deploy`
- 資料庫：新增 migration 後 `supabase db push`
- Edge Function：`supabase functions deploy parse-receipt --use-api`

### 注意事項

- **免費的 Supabase 專案閒置 7 天會自動暫停。** 暫停後 App 會顯示無法連線；到 Dashboard 按 **Restore project** 即可恢復，資料不會遺失。出發前一兩天先打開 App 確認，旅途中天天使用就不會被暫停。
- 免費方案每個帳號最多 2 個運作中的專案。
- Storage 下載會經過 CDN 快取；收據上傳時設定 `cacheControl: 60`，刪除後最多約 1 分鐘內就無法再取得。非旅程成員不論何時都無法讀取。
- Gemini 免費額度用完時，App 會提示改為手動輸入，不影響其他功能。
