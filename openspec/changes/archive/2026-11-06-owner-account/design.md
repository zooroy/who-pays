# Design

## Context

- **Session**：每個瀏覽器在 `ensureSession()`（`src/lib/supabase.ts`）時匿名登入，取得一個 uid。
- **存取權**：存取權只存在 `trip_access(trip_id, user_id)`。
  - RLS 透過 `has_trip_access()` 判斷能否讀取，Storage 的收據政策也是。
  - RPC（`add_member`、`upsert_expense`、`delete_expense`、`update_member`）則是直接查 `trip_access`。
- **加入旅程**：`TripPage` 每次開啟旅程都先呼叫 `join_trip(share_token)`，這個 RPC 會補上 `trip_access` 這一列。
- **「我是誰」**：存在 localStorage（`whopays:trip:<id>:member`，`src/lib/identity.ts`），所以換瀏覽器就不見。
- **成員的外鍵**：`members` 被 `expenses`（paid_by／created_by／updated_by）、`expense_splits`、`settlements`（from／to／created_by）以外鍵引用，而且都沒有 `on delete`。`members`、`expenses`、`settlements` 對 `trips` 的外鍵也沒有 cascade。
- **Realtime**：
  - INSERT 和 UPDATE 依 `trip_id` 過濾。
  - DELETE 無法過濾，目前只訂閱了 expenses 和 settlements。
  - `trips` 資料表不在 publication 裡。
- **本機設定**：`supabase/config.toml` 目前 `enable_signup = true`、`enable_anonymous_sign_ins = true`。

## Goals / Non-Goals

**Goals:**

- 擁有者在任何裝置登入後，看到同一份資料，而且身份一致。
- 只有擁有者能建立旅程、刪除旅程、重設分享連結。
- 朋友的流程完全不變，不需登入。
- 任何人都能刪除沒有紀錄的成員。
- 既有資料不需要搬移。

**Non-Goals:**

- 多位擁有者的管理介面、角色或權限分級（不分檢視和編輯）。
- 朋友帳號登入、封鎖某個裝置的存取權。
- 忘記密碼和更改密碼的流程：擁有者只有一個人，到 Supabase 後台重設即可。
- 讓 App 支援離線使用。

## Decisions

### 1. 擁有者 = 擁有者名單中的帳號

新增 `public.app_owners(user_id uuid primary key references auth.users on delete cascade)`：

- 啟用 RLS，但不建立任何 policy，並撤銷 anon 與 authenticated 的所有權限。
- 擁有者由使用者在 SQL 編輯器手動 insert。

另外新增 `public.is_owner()`（security definer、stable），回傳 `exists (select 1 from app_owners where user_id = auth.uid())`，並開放給 authenticated 執行。前端以 `rpc('is_owner')` 判斷現在是不是擁有者。

**考慮過的替代方案**：「非匿名使用者就是擁有者」（看 JWT 的 `is_anonymous`）。
- 這個做法依賴「關閉註冊」設定。但匿名使用者能用 `updateUser` 綁 email 升級成正式帳號，不確定會不會被「關閉註冊」擋下；一旦設定出錯，任何人都可能變成擁有者。
- 名單做法不依賴任何 Auth 設定，最壞的情況只是多了一些沒有權限的帳號。

### 2. 擁有者讀取全部旅程：改 `has_trip_access()`

`has_trip_access(p_trip_id)` 改成 `is_owner() or exists(... trip_access ...)`。所有用到它的地方都會自動讓擁有者通過，不必另外處理：
- RLS 的讀取政策
- Realtime（它依 RLS 判斷）
- Storage 的收據政策

擁有者首頁的列表直接 select `trips`，就能看到全部旅程。

寫入類的 RPC **維持直接查 `trip_access`**，理由如下：
- 擁有者進入旅程頁時，一定會先經過 `join_trip`，這時 `trip_access` 就有這一列了，所以不需要動既有的 RPC。
- 新增的 RPC 一律改用 `has_trip_access()`。

### 3. 身份改存在 `trip_access.member_id`

**資料表變更**

在 `trip_access` 新增 `member_id uuid` 欄位：
- 外鍵 `(trip_id, member_id) references members(trip_id, id) on delete set null (member_id)`。
- 因為擁有者跨裝置都是同一個 uid，「每個 uid 在每個旅程是誰」記在這裡，就能跨裝置一致。朋友則是每個瀏覽器各自一列。

**讀寫方式**

- **讀取**：直接 select 自己那一列。既有的 policy「users can read their own access rows」已經允許。
- **寫入**：新增 RPC `set_my_member(trip_id uuid, member_id uuid)`：
  - 需要 `has_trip_access`。
  - 會 upsert `trip_access`，所以擁有者就算還沒經過 `join_trip` 也能寫入。
  - `member_id` 可以是 null，代表清除。
  - 成員不屬於這個旅程時，回傳 `TRIP_ACCESS_DENIED`。
- **建立旅程**：`create_trip` 建立旅程時，同時寫入建立者的 `member_id`。

**登入時沿用匿名身份**

登入前先讀出這個瀏覽器匿名使用者的 `trip_access.member_id`，登入後對擁有者帳號還沒有身份的旅程呼叫 `set_my_member`。這是「第一次登入沿用身份」的主要機制：因為下面的 localStorage 搬移在 App 啟動時就會把舊身份搬給匿名使用者，登入時 localStorage 通常已經清空了。

**沿用舊的 localStorage 身份**

新增 `migrateLocalIdentities()`，在登入成功後，以及每次 App 啟動取得 session 後執行：
1. 掃描 localStorage 裡的 `whopays:trip:*:member`。
2. 對資料庫中 `member_id` 還是 null 的旅程呼叫 `set_my_member`。
3. 寫入成功後刪除那個 key。

一個機制同時解決兩件事：
- 擁有者「第一次登入沿用身份」。
- 既有朋友的身份從 localStorage 搬到資料庫。

失敗時（例如成員已經被刪除）只刪除該 key，不顯示錯誤。

**前端**：`identity.ts` 的 `readIdentity`／`saveIdentity` 改成以 React Query 讀寫資料庫，查詢 key 是 `[...tripKey(id), 'me']`。切換身份與認領身份都改呼叫 `set_my_member`。

### 4. 只有擁有者能建立旅程

在 `create_trip` 開頭加上：`if not public.is_owner() then raise ... 'OWNER_REQUIRED'`。

另外把產生分享碼的迴圈抽成 `public.new_share_token()`（拒絕取樣，不變），與 `reset_share_token` 共用。

### 5. 刪除旅程：`delete_trip(trip_id uuid)`

**權限**：只限擁有者（`OWNER_REQUIRED`）。旅程不存在時回傳 `TRIP_NOT_FOUND`。

**刪除順序**：因為外鍵沒有 cascade，RPC 依序刪除：
1. settlements
2. expenses（splits 和 items 會跟著 cascade）
3. trip_access
4. members
5. trips

**收據照片**：Supabase 不建議直接刪除 `storage.objects`，所以由前端先刪照片：
- 用 `storage.from('receipts').list(tripId)` 列出照片，分批 `remove`，再呼叫 `delete_trip`。
- 照片刪除失敗時中止，旅程不刪，提示重試。
- 擁有者通過 Storage 的刪除政策（見決策 2）。

**考慮過的替代方案**：在 RPC 裡把外鍵改成 `on delete cascade`。這需要重建多條外鍵，而且會讓「刪除成員」也可能連帶刪除帳務，風險比較高，所以不採用。

### 6. 重設分享連結：`reset_share_token(trip_id uuid) returns text`

只限擁有者。用 `new_share_token()` 產生新的分享碼並更新 `trips.share_token`，遇到 unique 衝突就重試，最後回傳新的分享碼。

`trip_access` 不變動，所以已加入的人仍可從首頁進入，因為首頁列表用的是最新的 `share_token`。

舊連結交給 `join_trip` 處理，它會回傳 `TRIP_NOT_FOUND`，畫面就沿用既有的「找不到此旅程」。已加入的朋友如果收藏了舊網址，也會看到這個畫面，但按「回到我的旅程」就能看到該旅程。這是可以接受的取捨。

重設後**不自動複製**新連結：等完 RPC 才呼叫 `navigator.clipboard.writeText`，瀏覽器已不把它視為使用者點擊（iOS Safari 會拒絕，實測 Chrome 甚至會一直卡住）。改為顯示提示與「複製新連結」按鈕，由使用者自己按。

正在旅程頁的人收到新的分享碼後，頁面自動換到新網址，並預填新 token 的 join 快取，所以頁面不會重新載入，開著的面板也不會關閉。

把 `trips` 加進 Realtime publication，訂閱 `UPDATE`（過濾條件 `id=eq.<tripId>`），讓正在旅程頁的人收到新的分享碼和名稱。

### 7. 刪除成員：`delete_member(member_id uuid)`

**權限**：需要 `has_trip_access`。成員不存在時，跟 `update_member` 一樣回傳 `TRIP_ACCESS_DENIED`，不洩漏成員是否存在。

**檢查紀錄**：先 `for update` 鎖住這個成員，再計算相關紀錄的數量：
- `expenses`：`paid_by`、`created_by` 或 `updated_by` 是這個成員，或在 `expense_splits` 裡有他，同一筆支出只算一次。
- `settlements`：`from_member`、`to_member` 或 `created_by` 是這個成員。

數量大於 0 時，`raise exception using errcode = 'P0001', message = 'MEMBER_HAS_RECORDS', detail = <數量>`。前端從 `error.details` 讀出數量，顯示「阿美還有 3 筆支出或還款紀錄，請先修改或刪除這些紀錄。」

**刪除時的競態**：檢查與刪除之間，另一個人可能剛好新增一筆引用這個成員的支出。這時外鍵會讓 delete 失敗（`foreign_key_violation`），RPC 把它轉成 `MEMBER_HAS_RECORDS`，不會留下壞資料。

**刪除後**：`trip_access.member_id` 會自動變成 null（外鍵 set null）。

**Realtime**：`useTripRealtime` 的 DELETE 訂閱加入 `members`。被刪除身份的裝置重新取得 `me` 之後，會得到 null，畫面回到選擇身份；他的 `trip_access` 還在，所以仍能存取旅程。

### 8. 登入、登出與 session

- **登入**：新增 `/login` 頁，有 email、密碼和「登入」按鈕。
  - 呼叫 `supabase.auth.signInWithPassword`。登入後原本的匿名 session 會被取代。這個匿名使用者的資料不會再用到，但擁有者能讀取全部旅程（決策 2），所以沒有影響。
  - 登入成功後執行 `migrateLocalIdentities()`，清除所有 React Query 快取，再回到首頁。
- **登入失敗**：一律顯示「email 或密碼不正確。」，不區分是帳號不存在還是密碼錯。
- **登出**：呼叫 `supabase.auth.signOut()`，接著 `ensureSession()` 重新匿名登入，清除快取，再回到首頁。
- **Auth 設定**：
  - email 註冊**不能關閉**。實測發現本機 `[auth.email] enable_signup = false` 會連 email 密碼登入一起停用（`email_provider_disabled`）；正式環境的全域「Allow new users to sign up」關掉也會擋住匿名登入。所以兩者都維持開啟。
  - 正式環境用後台 Add user 建立擁有者帳號（勾選 auto confirm），並保留預設的「Confirm email」。
  - 權限只來自決策 1 的擁有者名單：有人自行註冊 email 帳號，也只會被當成一般的朋友，沒有任何擁有者權限。
- **為什麼用密碼，不用 Magic link 或驗證碼**：只有一個使用者，密碼不需要寄信，不受 Supabase 內建寄信數量限制，也能直接在主畫面 App 內完成登入。

### 9. 介面

**首頁 `MyTrips`**

| 狀態 | 顯示內容 |
|---|---|
| 擁有者 | 全部旅程、「建立新旅程」、底部一個 quiet 的「登出」 |
| 朋友，有旅程 | 加入過的旅程、收合的「用旅程連結開啟」、底部 quiet 的「擁有者登入」 |
| 朋友，沒有旅程 | 說明「請向朋友索取旅程連結，點開就能加入。」、「用旅程連結開啟」、「擁有者登入」 |

- 收合使用 `<details>`，或一個按鈕切換顯示。
- `/new` 路由在非擁有者時直接導回首頁。

**旅程頁**

- **擁有者**：多一個「旅程設定」面板，裡面有：
  - 「重設分享連結」：要先確認，確認後顯示新連結已複製。
  - 「刪除旅程」：在 `danger` 區塊內，確認時要說明會一起刪除的資料。
- **編輯成員面板**：底部加上「刪除成員」，按下後換成確認步驟（「刪除小明」／「取消」），不使用瀏覽器的 `confirm()`。

**錯誤訊息**：`membershipError` 新增兩種：
- `OWNER_REQUIRED`：「只有擁有者可以這樣做。」
- `MEMBER_HAS_RECORDS`：「<名字>還有 N 筆支出或還款紀錄，請先修改或刪除這些紀錄。」

## Risks / Trade-offs

- **連結就是鑰匙**：拿到連結的人都能編輯旅程。緩解方式是決策 6 的重設分享連結，被轉傳時重設即可。
- **擁有者帳號被盜，所有旅程都會外流**：請使用強密碼。之後可以考慮在 Supabase 啟用 MFA，不在這次範圍內。
- **在 Supabase 後台刪除擁有者帳號**：`app_owners` 會 cascade 刪除，擁有者失去權限，但旅程資料仍在。只要重新建立帳號並重新登記即可，`trip_access` 和身份要重新選擇。
- **既有的 pgTAP 測試**：測試用匿名使用者呼叫 `create_trip`，這次之後會失敗，需要讓建立旅程的測試使用者先登記為擁有者。
- **刪除旅程中途失敗**：照片已經刪了一部分，但 RPC 失敗時，會留下照片不完整的旅程。照片只是紀錄，金額不受影響，再按一次刪除即可完成。
- **Realtime 的 DELETE 事件無法過濾**：members 的刪除事件會傳給所有開著旅程的人，每個人都會重新讀取一次。以這個 App 的規模來說，成本可以接受，跟現在 expenses 的做法一致。

## Migration Plan

1. 新增 migration `20261106000000_owner_account.sql`，內容包含：
   - `app_owners` 與 `is_owner()`
   - 改寫 `has_trip_access()`
   - `trip_access.member_id`
   - `new_share_token()`，改寫 `create_trip`
   - `set_my_member`、`delete_member`、`delete_trip`、`reset_share_token`
   - 把 `trips` 加入 Realtime publication
2. 正式環境，依序執行：
   1. 使用者執行 `supabase db push`。
   2. 在後台 Authentication 建立擁有者帳號（確認匿名登入與註冊都維持開啟）。
   3. 在 SQL 編輯器執行：`insert into public.app_owners(user_id) select id from auth.users where email = '<擁有者 email>';`
   4. 使用者執行 `npm run deploy`。
3. **部署順序**：先 db push 再部署前端。部署前端之前，現有的前端仍能運作：讀取權限只有擴大；`create_trip` 雖然會被擋，但擁有者完成登記前本來就不會用到它。
4. **回復方式**：把 `has_trip_access()` 和 `create_trip` 改回原本的定義，新增的欄位與函式可以保留，不影響舊版前端。
