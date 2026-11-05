# Design

## Context

延續 MVP 的架構（見 `openspec/changes/archive/2026-11-05-build-who-pays-mvp/design.md`）：

- 每個裝置以 Supabase 匿名登入取得一個使用者；`trip_access(trip_id, user_id)` 記錄這個使用者能存取哪些旅程，所有資料表以 `has_trip_access` 的 RLS 控管。
- 「我是哪位成員」只存在瀏覽器 `localStorage`（`src/lib/identity.ts`，每個旅程一筆），資料庫不知道。
- `/` 目前固定是 `CreateTrip`；`/t/:shareToken` 先呼叫 `join_trip` 取得權限再顯示旅程。
- 寫入一律經由 `security definer` RPC；`members` 有 `unique (trip_id, avatar_id)`（`members_trip_avatar_key`），名字有 `btrim(name) <> ''` 檢查。
- Realtime 已訂閱 `members` 的 INSERT／UPDATE。
- iOS「加入主畫面」的 App 與 Safari 的儲存空間不共用，因此主畫面 App 第一次開啟時是全新的匿名使用者，沒有任何 `trip_access`，也沒有身份紀錄。

## Goals / Non-Goals

**Goals:**
- 任何時候都能回到「我的旅程」，建立或切換旅程。
- 主畫面 App（或任何新瀏覽器）能用分享連結在一分鐘內接回既有旅程與身份。
- 成員資料可修正，切換身份不會誤觸就失去身份。
- 新 icon 與 App 視覺一致。

**Non-Goals:**
- 帳號登入或跨裝置自動同步（使用者已決定不做）。
- 離開旅程、刪除旅程、刪除成員。
- 改變支出、收據、結算的行為。

## Decisions

### 1. 「我的旅程」直接查 `trips`，不另存清單

首頁以 `select id, name, share_token, default_currency, created_at from trips order by created_at desc` 取得清單。現有 RLS「members of a trip can read it」已只回傳目前匿名使用者有 `trip_access` 的旅程，不需要新增 API 或 migration。

- **替代方案**：在 `localStorage` 存一份旅程清單。缺點是與資料庫可能不一致（例如清除網站資料後清單還在但權限沒了），而且主畫面 App 同樣是空的，沒有額外好處。
- 清單項目以車票（`Ticket`）呈現，顯示旅程名稱與主要貨幣。成員頭像以同一次查詢的嵌入關聯（`members(id, avatar_id)`）取得，顯示我在這趟的頭像（由 `identity` 對應；尚未認領則不顯示），不逐筆另外查詢。

### 2. 路由

```
/                 我的旅程（有旅程：列表 + 建立新旅程 + 用連結開啟）
                  （沒有旅程：建立表單 + 用連結開啟）
/new              建立旅程表單（從列表進入；可返回 /）
/t/:shareToken    旅程（標題列左側加「我的旅程」返回入口）
```

`AppShell` 新增選填的返回入口（連結到 `/`），只在旅程頁與 `/new` 顯示。找不到旅程的畫面改為連到 `/`。PWA 的 `start_url` 維持 `/`，主畫面 App 打開就是「我的旅程」。

### 3. 用旅程連結開啟

首頁提供一個文字欄位與「開啟旅程」按鈕，另提供「貼上剪貼簿的連結」按鈕（`navigator.clipboard.readText()`；iOS 會跳出系統的「貼上」確認，不支援或被拒時只保留手動貼上，不顯示錯誤）。

解析規則：從輸入文字中找出 `/t/<22 碼英數字>`，接受完整網址、沒有協定的網址，或只貼 token 本身；不檢查網域，讓本機與正式環境都可用。解析失敗顯示「這不是有效的旅程連結」且不離開首頁。解析成功即導向 `/t/<token>`，之後完全沿用既有的 `join_trip` → 加入或認領流程。

### 4. 名字選填：在前端補預設值

`CreateTrip`、`MemberForm`（加入旅程與新增朋友共用）在送出時若名字為空，改用 `AVATARS[avatar].name`。資料庫的「名字不可為空」檢查保留不動，RPC 也不改，避免空名字從其他途徑寫入。名字欄位標示為「名字（選填）」，placeholder 顯示目前所選頭像的名稱，讓使用者知道留空會用什麼名字。

### 5. 編輯成員：新增 `update_member` RPC

新 migration 新增 `update_member(member_id uuid, name text, avatar_id text) returns void`，`security definer`，行為與 `add_member` 對齊：

- `auth.uid()` 為空 → `AUTH_REQUIRED`；成員所屬旅程沒有 `trip_access` → `TRIP_ACCESS_DENIED`（成員不存在也回這個，不洩漏存在與否）。
- `update members set name = btrim(name), avatar_id = avatar_id where id = member_id`；違反 `members_trip_avatar_key` → `AVATAR_TAKEN`；名字空白由既有 check 擋下。
- 權限：同旅程任何成員可改任何成員（使用者已選定）。資料庫本來就不知道「目前身份」，這與現有支出可由任何成員修改的模式一致。

前端：成員面板中每位成員可點選進入編輯，表單沿用 `MemberForm`（加上初始值；頭像選擇器把「自己目前的頭像」視為可選）。儲存後 `members` 的 UPDATE 會經 Realtime 推給其他人，支出、結算畫面都由 `members` 取名字與頭像，不需額外處理。

- **替代方案**：開放 `members` 表直接 `update` 的 RLS policy。不採用，因為專案慣例是寫入一律經 RPC，且 RPC 才能把 unique violation 轉成 `AVATAR_TAKEN`。

### 6. 切換身份：先選再換

成員面板的「切換身份」改為在面板內顯示成員清單（與加入畫面的「我是……」相同樣式）加「取消」。選定某位成員才呼叫 `saveIdentity`；取消回到成員面板，`localStorage` 完全不動。不再呼叫 `clearIdentity`。目前身份在清單中標示為「目前」且不可點選。

### 7. 新 icon：ip-as-logo

- **製作**：由 Codex 依 ip-as-logo 流程執行。先提三個方向給使用者確認，再產生六張候選，使用者選定一張。Claude 無法產生圖片；Codex 額度 ≤ 3% 時此項等待額度重置。
- **顏色**：只用 design token。背景用車票綠 `#e3eee8`；角色兩色從靛藍墨 `#22385c`、票面白 `#fafcfb`、朱肉紅 `#c8323c` 中選兩個。朱肉紅在 App 中只用於「已付」印章，用在 icon 上須是印章意象的一部分。
- **構圖**：一般 icon（favicon、`pwa-192`、`pwa-512`、`apple-touch-icon`）沿用 skill 預設的左下角探出構圖。
- **maskable**：`pwa-maskable-512` 不直接使用原圖。從選定的原圖把角色縮放並移到中央安全區（直徑 80% 的圓內），四周以背景色補滿。這一步由 Claude 用腳本處理（沿用 MVP 的 `make-icons.py` 做法），不再呼叫圖像模型。
- **尺寸**：原圖至少 1024×1024，再縮成各尺寸；favicon 須在 32×32 仍可辨識。
- 舊 icon 檔名保持不變直接覆蓋，`vite.config.ts` 與 `index.html` 的引用不需改。

## Risks / Trade-offs

- [主畫面 App 仍需手動貼一次連結] → 首頁在沒有旅程時把「用旅程連結開啟」放在明顯位置，並在成員面板的提示文字說明「加入主畫面後，第一次打開請貼上旅程連結」。
- [任何成員都能改別人的名字與頭像] → 使用者已接受；朋友之間分帳風險低，且所有修改即時可見。
- [`clipboard.readText` 在部分瀏覽器不可用或需權限] → 只作為便利按鈕，手動貼上永遠可用。
- [左下角構圖在 Android 圓形遮罩被裁切] → maskable 版另行處理（Decision 7）。
- [iOS 更新主畫面 icon 需要重新加入主畫面] → 在交付說明中告知使用者；不影響功能。

## Migration Plan

1. `supabase db push` 套用新的 `update_member` migration（只新增函式，無資料變更，可直接 `drop function` 回復）。
2. `npm run deploy` 部署前端；舊版 service worker 會自動更新。
3. 回復：重新部署前一版前端即可；`update_member` 留著不影響舊版。
