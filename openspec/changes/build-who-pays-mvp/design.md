# Design

## Context

這是全新專案，目錄中除了 OpenSpec 設定之外沒有任何程式碼。動機與範圍見 proposal.md，行為要求見 `specs/` 下的四個 capability。

主要限制：
- 使用者只是一群朋友，維運成本與費用要接近零（Supabase 免費方案、Gemini 免費額度）。
- 使用情境是旅途中單手操作手機，網路可能不穩。
- 不做註冊登入，但旅程資料不能被陌生人列舉出來。

## Goals / Non-Goals

**Goals:**
- 純前端 PWA 搭配 Supabase 託管服務，除了一支 Edge Function 之外不寫自訂後端。
- 結算邏輯是純函式，能用單元測試完整覆蓋。
- 以「知道連結 = 有權限」的模型保護資料，同時讓即時同步能正常套用權限檢查。

**Non-Goals:**
- 離線新增支出、離線佇列與衝突合併（PWA 只快取靜態資源）。
- 多語系介面（介面只有繁體中文）。
- 防範旅程內成員的惡意行為（例如冒用身份、亂刪資料）。

## Decisions

### 1. 架構總覽

```
  +---------------------------+          +-------------------------------------+
  |  React (Vite) PWA         |          |  Supabase                           |
  |  - react-router           |  HTTPS   |  - Auth (anonymous sign-in)         |
  |  - @tanstack/react-query  | <------> |  - Postgres + RLS                   |
  |  - supabase-js            |  WS      |  - Realtime (postgres_changes)      |
  |  - vite-plugin-pwa        | <------> |  - Storage: receipts bucket         |
  |  - 頭像 / 字體打包在前端     |          |  - Edge Function: parse-receipt ----+--> Gemini API
  +---------------------------+          +-------------------------------------+
```

靜態前端部署在任何靜態主機（Cloudflare Pages、Vercel 或 Netlify 擇一）。

### 2. 身份與權限：Supabase 匿名登入 + trip_access

**做法**：每個瀏覽器第一次開啟 App 時，自動以 Supabase anonymous sign-in 取得一個 `auth.uid()`，使用者完全無感。開啟旅程連結 `/t/<share_token>` 時，呼叫 RPC `join_trip(share_token)`。這支 `security definer` 函式用 token 找到旅程，並寫入 `trip_access(user_id, trip_id)`。之後所有資料表的 RLS 只有一條規則：`trip_id` 必須在目前使用者的 `trip_access` 之內。

**為什麼**：Realtime 的 `postgres_changes` 會用使用者的 JWT 檢查 RLS，所以權限規則必須能從 `auth.uid()` 推導。用 header 傳 token 的 RLS 做法在 REST 上可行，在 Realtime 上卻不可行。

**考慮過的替代方案**：
- 純 anon key + 以 trip id 當秘密：任何人都能用 anon key `select * from trips` 列出所有旅程，不可接受。
- 自訂 header 傳 token 給 RLS：Realtime 拿不到 header。
- Realtime broadcast 通知後重新抓資料：可行，但要多維護一套頻道協定。

**身份對應**：「我是哪位成員」存在 localStorage（`whopays:trip:<trip_id>:member = <member_id>`），不寫進資料庫。因此認領身份不需要任何驗證，符合 spec。換裝置或清除瀏覽器資料時，會產生新的匿名 user，重新開啟連結即可再次 `join_trip` 並認領身份。

`share_token` 是 22 字元的隨機 base62 字串，與內部 `trip_id`（uuid）分開，未來需要時可以重新產生連結。

### 3. 資料模型

```
  trips
    id uuid pk, share_token text unique, name text,
    default_currency text, created_at
  trip_access
    trip_id fk, user_id uuid (auth.uid), pk(trip_id, user_id)
  members
    id uuid pk, trip_id fk, name text, avatar_id text, created_at
    unique(trip_id, avatar_id)            -- 頭像唯一，也間接限制最多 16 人
    check(avatar_id in 16 個合法 id)
  expenses
    id uuid pk, trip_id fk, title text, amount bigint (> 0),
    currency text, spent_on date, paid_by fk members,
    receipt_path text null, receipt_raw jsonb null,
    created_by fk members, updated_by fk members, created_at, updated_at
  expense_splits
    expense_id fk (on delete cascade), member_id fk, pk(expense_id, member_id)
  expense_items
    id uuid pk, expense_id fk (on delete cascade), position int,
    name text, name_zh text null, qty numeric, unit_price bigint null, amount bigint
  settlements
    id uuid pk, trip_id fk, from_member fk, to_member fk,
    amount bigint (> 0), currency text, created_by fk members, created_at
```

- 頭像唯一靠 `unique(trip_id, avatar_id)` 保證；兩人同時搶同一個頭像時，後到的請求會違反約束，前端轉成「已被選走」的提示。
- 支出與分攤者、品項的新增和修改，透過 RPC `upsert_expense(payload jsonb)` 在同一個 transaction 中完成，避免只寫進一半。
- `receipt_raw` 保存 Gemini 原始回應，方便除錯和日後改進 prompt，不顯示在介面上。
- 成員目前不支援刪除（已被引用的成員刪掉會讓帳對不上），第一版不提供。

### 4. 金額表示

金額一律以**整數的最小貨幣單位**保存（`bigint`）。前端維護幣別表 `{ code, symbol, exponent }`：JPY 與 TWD 的 exponent 都是 0（台幣實務上不用角），之後加入 USD 等貨幣時 exponent 為 2。這樣可以避開浮點誤差，未來擴充幣別也不必修改資料庫。

### 5. 結算演算法（前端純函式）

```
  balances(expenses, splits, settlements) -> Map<currency, Map<member, net>>
    每筆支出：  net[paid_by] += amount
               shares = splitEvenly(amount, splitters)   // 依 member.created_at 排序
               net[m]  -= shares[m]
    每筆還款：  net[from] += amount ; net[to] -= amount

  splitEvenly(1000, [a,b,c]) -> a:334, b:333, c:333
    base = floor(amount / n)，餘數一單位一單位分給排序在前的人（結果是確定的）

  suggestTransfers(netByMember) -> [{from, to, amount}]
    貪婪法：每次讓「欠最多的人」付給「應收最多的人」min(兩者)，直到全部歸零
    最多 n-1 筆，雖然不保證全域最少，但在 16 人以內的規模已足夠
```

結算結果不存進資料庫，每次從原始資料重新計算，因此不會出現資料不同步的問題。

**考慮過的替代方案**：在資料庫用 view 或函式計算。資料量很小（一趟旅程頂多數百筆），放在前端算更容易測試，也能在收到 Realtime 事件後立即重算。

### 6. 即時同步

每個旅程頁面訂閱一個 channel，監聽 `members`、`expenses`、`expense_splits`、`expense_items`、`settlements` 的變更。收到事件時不在本地套用 diff，而是讓 react-query 失效、重抓該旅程的完整資料。資料量小，這樣做最簡單，也不會出錯。

- **INSERT／UPDATE**：以 `trip_id=eq.<id>` 過濾。為此 `expense_splits` 與 `expense_items` 也冗餘存一份 `trip_id`。
- **DELETE**：Supabase 無法依欄位過濾刪除事件，也不對刪除事件套用 RLS，所以 `expenses` 與 `settlements` 的刪除改為不加過濾地訂閱，收到任何刪除就重抓目前的旅程。子表跟著支出 cascade 刪除，不需要另外監聽。實作時以 `scripts/realtime-delete-check.ts` 驗證過，加上過濾條件會完全收不到刪除事件。

### 7. 收據辨識流程

```
  前端                                  Edge Function: parse-receipt          Gemini
   |-- 壓縮：最長邊 1600px、JPEG q=0.8      |                                    |
   |-- 上傳 receipts/<trip_id>/<uuid>.jpg  |                                    |
   |-- POST { trip_id, path } + JWT ------>|                                    |
   |                                      |-- 驗證 JWT、檢查 trip_access          |
   |                                      |-- 從 Storage 取得圖片                 |
   |                                      |-- generateContent(圖片, prompt,      |
   |                                      |     responseSchema) ---------------->|
   |                                      |<----------------------- JSON -------|
   |<-- 200 ReceiptResult | 4xx/5xx {code}-|                                    |
   |-- 開啟確認畫面（預填）                  |                                    |
```

- **模型**：用環境變數 `GEMINI_MODEL` 設定，預設使用部署當下免費方案可用的 Flash 系列模型。模型改版時只要改設定。
- **Structured output**：以 `responseMimeType: application/json` 搭配 `responseSchema` 強制輸出格式，不靠 prompt 規範 JSON。
- **錯誤碼**：Function 把錯誤對應成 `QUOTA_EXCEEDED`（Gemini 429）、`NOT_A_RECEIPT`、`TIMEOUT`（逾時 25 秒）、`UPSTREAM_ERROR`，前端依此顯示 spec 要求的文字，再退回手動輸入。
- **Storage 權限**：`receipts` bucket 不公開，RLS 依路徑第一段 `trip_id` 檢查 `trip_access`；前端用 signed URL 顯示照片。刪除支出時由前端先刪除照片物件，再刪除支出。

**ReceiptResult 格式**（同時是 `responseSchema` 的來源）：

```json
{
  "store_name": "一蘭 新宿中央東口店",
  "date": "2026-11-02",
  "time": "19:42",
  "currency": "JPY",
  "items": [
    { "name": "ラーメン", "name_zh": "拉麵",   "qty": 2, "unit_price": 980, "amount": 1960 },
    { "name": "餃子",     "name_zh": "餃子",   "qty": 1, "unit_price": 540, "amount": 540 },
    { "name": "生ビール", "name_zh": "生啤酒", "qty": 2, "unit_price": 370, "amount": 740 }
  ],
  "subtotal": 3240,
  "tax": 0,
  "service_charge": 0,
  "discount": 0,
  "total": 3240,
  "invoice_number": null,
  "confidence": "high",
  "is_receipt": true,
  "notes": null
}
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `store_name` | string \| null | 預設為支出名稱 |
| `date` / `time` | string \| null | `YYYY-MM-DD` / `HH:mm`；讀不到時日期預設今天 |
| `currency` | string | ISO 4217；依「円」、「NT$」等符號判斷 |
| `items[].name` | string | 收據原文 |
| `items[].name_zh` | string | 繁體中文翻譯；原文已是中文就照抄 |
| `items[].qty` / `unit_price` / `amount` | number | `amount` 為該行小計；`unit_price` 可為 null |
| `subtotal` / `tax` / `service_charge` / `discount` | number \| null | 用來做加總檢查 |
| `total` | number \| null | 分帳金額的來源；null 時金額欄位留空讓使用者填 |
| `invoice_number` | string \| null | 台灣統一發票號碼 |
| `confidence` | `high` \| `medium` \| `low` | low 時在確認畫面提示 |
| `is_receipt` | boolean | false 時回傳 `NOT_A_RECEIPT` |
| `notes` | string \| null | 模型補充說明，只存在 `receipt_raw` |

金額都以收據上的單位表示；對 JPY、TWD 來說就等於最小單位。加總檢查公式：`sum(items.amount) + (tax ?? 0) + (service_charge ?? 0) - (discount ?? 0) == total`。日本收據常見「内税」（稅已含在品項價格中），所以 prompt 會要求模型在內含稅時把 `tax` 填 0，避免重複計算。

### 8. 視覺設計：車票與印章

依 frontend-design skill 的流程產出，實作 UI 時同樣以該 skill 為準。

**色票**

| 名稱 | Hex | 用途 |
|---|---|---|
| 車票綠 | `#E3EEE8` | App 背景，取自日本車票的淡綠底紋 |
| 票面白 | `#FAFCFB` | 支出票卡、輸入區 |
| 靛藍墨 | `#22385C` | 文字、金額、主要按鈕 |
| 朱肉紅 | `#C8323C` | 只用於「已付」印章，全 App 唯一的強調色 |
| 次要墨 | `#5A6B63` | 次要文字（在票面白上 5.5:1）|
| 剪票灰 | `#9AA8A1` | 撕線、框線、停用狀態；對比只有 2.4:1，不可用於文字 |

錯誤提示用靛藍墨文字搭配圖示，不另外引入紅色，以免和印章的語意混淆。所有文字和背景的對比都要達到 WCAG AA。

**字體**：只用 jf open 粉圓（OFL 授權，支援繁中與日文假名）一個字族。它只有一種字重，所以層級完全靠大小，並設定 `font-synthesis: none` 避免瀏覽器假加粗；金額使用 tabular numbers。字體檔較大，以 woff2 自行託管、`font-display: swap`，並由 service worker 快取。

**版面**
```
  +----------------------------+
  | 東京 2026     (熊)(貓)(企)  |  <- 成員頭像列，目前使用者有外框
  |----------------------------|
  | 11/02                      |
  | +------------------------+ |
  | | 一蘭        ¥3,240     | |  <- 票卡：直角，左右有剪票半圓缺口
  | | (熊) 付 · 4 人分        | |
  | +- - - - - - - - - - - - + |  <- 鋸齒撕線
  | ...                        |
  |----------------------------|
  | [ 手動 ]   [ 拍收據 ]       |  <- 拇指區；拍收據是最大的按鈕
  | [ 支出 ]   [ 結算 ]         |  <- 底部分頁
  +----------------------------+
```
- 單手、拇指優先：主要操作集中在畫面下半部。
- 內容靠左對齊，金額靠右對齊。
- 頭像代替名字：列表中只顯示頭像，明細中才顯示名字。
- 票卡刻意採直角加剪票缺口，與一般圓角陰影卡片區隔；不使用漸層和浮起陰影。
- **唯一的大膽時刻**：標記已付時，朱紅印章旋轉約 -8 度、從放大落下並帶一點墨暈。`prefers-reduced-motion` 時直接顯示印章，不播放動畫。

**頭像庫**：上述色票確定後，用 ip-as-logo-skill 產生 16 隻動物吉祥物，以這份色票作為 palette 輸入，每隻的純色背景從一組協調的柔和色中選取並彼此可區分。輸出轉成 256px 的 webp 打包進前端，`avatar_id` 為穩定的英文代號（例如 `bear`、`cat`）。

### 9. 專案結構與測試

```
  /                     Vite React app（TypeScript）
  src/lib/money.ts      幣別表、格式化、splitEvenly
  src/lib/settle.ts     balances、suggestTransfers
  src/features/...      trip / expense / receipt / settlement 畫面
  supabase/migrations/  schema、RLS、RPC
  supabase/functions/parse-receipt/
```
- Vitest：`money.ts`、`settle.ts` 必須完整覆蓋 spec 中的計算情境（整除餘數、混用幣別、還款後歸零）。
- RLS：用 Supabase CLI 本機環境寫 SQL 測試，確認沒有 trip_access 的使用者讀不到任何資料。
- parse-receipt：用幾張真實收據（日本餐廳、超商、台灣發票）手動驗證輸出格式。

## Risks / Trade-offs

- [Supabase 免費專案閒置 7 天會被暫停] → 旅程結束後一段時間沒人開，連結會暫時失效；需要時到 Supabase 後台手動恢復。自己人用的情況可以接受，README 會註明。
- [Gemini 免費額度沒有保證，模型也可能下架] → 模型名稱可設定；額度用完時退回手動輸入，不會阻斷記帳。
- [收據影像可能被 Google 用於改進產品] → 在 proposal 載明；未來如果在意，可改用付費方案或其他模型，介面維持 ReceiptResult 不變。
- [任何拿到連結的人都能讀寫，成員也能冒用他人身份] → 這是刻意的取捨；不要把連結貼到公開場合。
- [匿名登入使用者會不斷累積在 auth 資料表] → 規模小，可以忽略。
- [刪除事件不受 RLS 限制，其他旅程的使用者也會收到] → 事件內容只有被刪除列的 id（預設 replica identity），不含金額、名稱等內容；代價是偶爾多一次重抓。
- [貪婪法不保證轉帳筆數全域最少] → 筆數上限為 n-1，對朋友出遊的規模已足夠。
- [CJK 字體檔大，第一次載入慢] → 字體 swap 加上 service worker 快取；第二次之後就是即時載入。
- [網路不穩時新增支出失敗] → 送出失敗時保留表單內容，並提供重試；不做離線佇列。

## Migration Plan

全新專案，不需要遷移。部署步驟：建立 Supabase 專案 → 套用 migrations → 開啟 anonymous sign-in → 設定 `GEMINI_API_KEY`、`GEMINI_MODEL` secrets 並部署 Edge Function → 建置前端並部署到靜態主機。

## Open Questions

- 16 隻吉祥物分別是哪些動物，在產生頭像時再決定。
- 靜態主機要選 Cloudflare Pages、Vercel 還是 Netlify，部署時再選，不影響程式碼。
