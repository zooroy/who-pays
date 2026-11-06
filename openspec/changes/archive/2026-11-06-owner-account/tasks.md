# Tasks

## 1. 資料庫：擁有者與身份

- [x] 1.1 新增 migration `20261106000000_owner_account.sql` 的第一部分（design 第 1、2、3、4 節）：
  - `app_owners` 與 `is_owner()`
  - `has_trip_access()` 加上擁有者判斷
  - `trip_access.member_id` 與外鍵（`on delete set null (member_id)`）
  - `new_share_token()`
  - `create_trip` 限擁有者，並寫入建立者的 `member_id`
  - `set_my_member`
  - 調整既有 pgTAP 測試，讓建立旅程的測試使用者先登記為擁有者
  - 新增 `supabase/tests/owner_account.test.sql`，涵蓋：非擁有者建立旅程回傳 `OWNER_REQUIRED`、擁有者可讀取未加入的旅程與收據、`set_my_member` 寫入與清除、成員不屬於該旅程時回傳 `TRIP_ACCESS_DENIED`、anon 沒有權限
  - 驗證：`supabase db reset && supabase test db` 全部通過
- [x] 1.2 同一個 migration 加入 `delete_member`、`delete_trip`、`reset_share_token`，並把 `trips` 加進 Realtime publication（design 第 5、6、7 節）。pgTAP 涵蓋：
  - 刪除沒有紀錄的成員
  - 付款人、分攤者、還款雙方、建立者各自回傳 `MEMBER_HAS_RECORDS`，並帶正確的數量
  - 刪除成員後 `trip_access.member_id` 變成 null
  - 非擁有者刪除旅程或重設連結回傳 `OWNER_REQUIRED`
  - 刪除旅程後相關資料全部清空
  - 重設連結後舊分享碼的 `join_trip` 回傳 `TRIP_NOT_FOUND`，已加入的人仍有存取權
  - 驗證：`supabase test db` 全部通過
- [x] 1.3 確認本機 email 註冊不能關閉（會連密碼登入一起停用），維持開啟並在 `config.toml` 註明原因；在 `supabase/seed.sql`（或 README 的本機步驟）說明如何建立本機擁有者帳號並登記。在 README 的 RPC 契約補上新增的 RPC 與錯誤碼。驗證：本機以 admin API 建立的擁有者帳號可用密碼登入，匿名登入仍然可用

## 2. 前端：身份與 session

- [x] 2.1 在 `src/features/trip/api.ts` 新增 `isOwner`、`getMyMember`、`setMyMember`、`deleteMember`、`deleteTrip`（先刪收據照片）、`resetShareToken`。`membershipError` 新增 `OWNER_REQUIRED` 與 `MEMBER_HAS_RECORDS` 的訊息。驗證：`npm run build`
- [x] 2.2 `identity.ts` 改成讀寫資料庫，並新增 `migrateLocalIdentities()`（design 第 3 節）。把 localStorage key 解析與搬移的判斷寫成純函式，用 Vitest 測試。`TripPage` 的認領身份與切換身份改用 `setMyMember`。驗證：`npm test` 通過，並在瀏覽器確認既有的 localStorage 身份在重新整理後自動搬進資料庫
- [x] 2.3 新增 `/login` 登入頁、登出流程與 `useIsOwner`（design 第 8 節），登入與登出後清除 React Query 快取。驗證：在瀏覽器確認 spec「擁有者登入」「密碼錯誤」「重新打開 App」「登出」四個情境

## 3. 前端：畫面

- [x] 3.1 依 design 第 9 節調整首頁：擁有者、有旅程的朋友、沒有旅程的訪客三種狀態；「用旅程連結開啟」收合；`/new` 只限擁有者。驗證：在瀏覽器確認 spec「擁有者的首頁」「朋友的首頁」「沒有旅程的訪客」「朋友無法建立旅程」「登入前已存在的旅程」
- [x] 3.2 在編輯成員面板加入刪除成員與確認步驟；`useTripRealtime` 加入 members 的 DELETE 訂閱與 trips 的 UPDATE 訂閱；身份被刪除時回到選擇身份。驗證：用兩個瀏覽器確認 spec「刪除加錯的成員」「成員有紀錄」「刪除正在使用中的身份」「取消刪除成員」
- [x] 3.3 擁有者的旅程設定面板：重設分享連結與刪除旅程，都要確認；刪除後回到首頁。驗證：在瀏覽器確認 spec「重設分享連結」「用舊連結加入」「已加入的朋友不受影響」「擁有者刪除旅程」「取消刪除」「朋友開啟已刪除的旅程」「朋友沒有刪除入口」

## 4. 整合驗證與部署

- [x] 4.1 執行 `npm run lint && npm test && npm run build && supabase test db`，全部通過
- [x] 4.2 正式環境（由使用者執行，design 的 Migration Plan）：
  1. `supabase db push`
  2. 在後台建立擁有者帳號（匿名登入與註冊維持開啟）
  3. 執行 SQL 登記擁有者
  4. `npm run deploy`
- [x] 4.3 使用者在 iPhone 確認：Safari 與主畫面 App 分別登入後看到同一份資料、身份一致；朋友的手機用連結加入後只看到該旅程；刪除成員與重設連結都正常
