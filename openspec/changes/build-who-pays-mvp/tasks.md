# Tasks

## 1. 專案骨架

- [x] 1.1 用 Vite 建立 React + TypeScript 專案，加入 react-router、@tanstack/react-query、supabase-js、vite-plugin-pwa、Vitest，並確認 `npm run dev`、`npm run build`、`npm test` 都能執行
- [x] 1.2 執行 `supabase init` 建立 `supabase/` 目錄，用 `supabase start` 啟動本機環境，並確認 Studio 可以開啟
- [x] 1.3 建立 `.env.example`（Supabase URL / anon key）與 README 的本機開發步驟，並照 README 從零跑起來一次驗證步驟正確

## 2. 金額與結算核心邏輯

- [x] 2.1 實作 `src/lib/money.ts`：幣別表（TWD、JPY，exponent 0）、金額格式化（¥3,240、NT$42,000）、`splitEvenly`；以 Vitest 驗證 1000 分 3 人為 334/333/333，且各份加總等於原金額
- [x] 2.2 實作 `src/lib/settle.ts` 的 `balances`：依幣別計算淨額並納入還款紀錄；以 Vitest 驗證 settlement spec 的單一幣別（熊 +500、貓 -100、企鵝 -400）與混用幣別不抵銷情境
- [x] 2.3 實作 `suggestTransfers`（貪婪法）與總花費、全部結清的判斷；以 Vitest 驗證轉帳後淨額歸零、筆數 ≤ n-1、已結清幣別不產生建議

## 3. 資料庫、權限與 RPC

- [x] 3.1 撰寫 migration：建立 design 第 3 節的所有資料表、約束（`unique(trip_id, avatar_id)`、金額 > 0、avatar_id 白名單），以 `supabase db reset` 套用成功作為驗證
- [x] 3.2 撰寫 RLS：所有資料表只允許 `trip_access` 內的使用者存取，並以 SQL 測試驗證沒有 trip_access 的匿名使用者 `select` 結果為空、`insert` 被拒絕
- [x] 3.3 實作 RPC `create_trip`（產生 22 字元 share_token、寫入建立者成員與 trip_access）與 `join_trip(share_token)`；以 SQL 測試驗證無效 token 回傳錯誤、有效 token 加入後即可讀取旅程
- [x] 3.4 實作 RPC `upsert_expense(payload)`，在單一 transaction 內寫入支出、分攤者、品項並記錄 updated_by；以 SQL 測試驗證分攤者為空時整筆失敗、不留下殘缺資料
- [x] 3.5 建立私有 `receipts` bucket 與依路徑 `trip_id` 判斷 trip_access 的 Storage 政策；驗證他人旅程的照片無法下載
- [x] 3.6 將相關資料表加入 Realtime publication，並為 `expense_splits`、`expense_items` 冗餘存放 `trip_id`；用兩個 client 驗證 A 新增支出時 B 能收到事件、無權限的 C 收不到

## 4. 視覺基礎與頭像庫

- [x] 4.1 安裝 frontend-design plugin，依 design 第 8 節建立 CSS tokens（五色、jf open 粉圓 woff2、字級階層、tabular numbers），並以一頁 token 預覽頁確認文字對比達 WCAG AA
- [x] 4.2 以 design 的色票作為 palette，用 ip-as-logo-skill 產生 16 隻吉祥物，轉成 256px webp 放入 `src/assets/avatars/`，建立 `avatar_id → 圖片` 對照表，並確認與 migration 的白名單一致
- [x] 4.3 實作共用元件：頭像（含目前使用者外框、已佔用灰化狀態）、票卡（直角、剪票缺口、鋸齒撕線）、底部分頁與拇指區按鈕；在預覽頁截圖檢查 375px 寬度下的呈現

## 5. 旅程與成員（trip-membership）

- [x] 5.1 啟動時自動執行 anonymous sign-in 並保留 session；驗證重新整理後 `auth.uid()` 不變
- [x] 5.2 實作建立旅程頁（名稱、主要貨幣、頭像），完成後導向 `/t/<share_token>`；驗證名稱為空時不送出並顯示提示
- [x] 5.3 實作 `/t/<share_token>` 進入流程：無效連結顯示找不到旅程；已有 localStorage 身份時直接進入；否則顯示加入畫面
- [x] 5.4 實作加入畫面：輸入名字並選擇頭像，或認領既有成員；已佔用的頭像不可選，滿 16 人時只能認領；驗證兩個瀏覽器同時搶同一頭像時，後到者看到「已被選走」
- [x] 5.5 實作複製分享連結、成員列表、新增佔位成員、切換身份；驗證佔位成員建立後立即可被選為付款人

## 6. 記帳（expense-tracking）

- [x] 6.1 實作支出列表（依日期由新到舊、票卡顯示付款人頭像與分攤人數）與空狀態引導；以手動資料驗證排序與空狀態
- [x] 6.2 實作新增或編輯支出表單：預設付款人為自己、分攤者為全員、幣別為主要貨幣、日期為今天；驗證金額 ≤ 0 與分攤者為空時不送出
- [x] 6.3 實作支出明細頁：品項列表（原文與中文）、品項加總與總額的差額提示、收據照片（signed URL）、「最後由 XX 修改」
- [x] 6.4 實作刪除支出（先刪照片再刪資料）；驗證刪除後列表與結算同步更新、Storage 中沒有殘留檔案
- [x] 6.5 訂閱旅程 channel，收到變更時讓 react-query 失效重抓；用兩支手機或兩個瀏覽器驗證一方新增、修改、刪除後，另一方數秒內看到
- [x] 6.6 送出失敗時保留表單內容並顯示重試；用 DevTools 模擬離線驗證

## 7. 收據辨識（receipt-scanning）

- [ ] 7.1 實作 Edge Function `parse-receipt`：驗證 JWT 與 trip_access、讀取 Storage 圖片、以 `responseSchema` 呼叫 `GEMINI_MODEL`、對應錯誤碼（QUOTA_EXCEEDED、NOT_A_RECEIPT、TIMEOUT、UPSTREAM_ERROR）；用 `supabase functions serve` 以 curl 驗證成功與無權限兩種情況
- [ ] 7.2 撰寫 prompt：品項保留原文並附繁中翻譯、內含稅時 tax 填 0、判斷 is_receipt 與 confidence；用日本餐廳、日本超商、台灣統一發票三張真實收據驗證輸出符合 design 第 7 節的格式
- [x] 7.3 前端實作拍照或選圖、壓縮（最長邊 1600px、JPEG 0.8）、上傳到 `receipts/<trip_id>/<uuid>.jpg`、顯示辨識中狀態；驗證上傳檔案小於 1MB
- [x] 7.4 實作確認畫面：預填辨識結果、所有欄位可修改、低信心與加總不一致的提示、儲存時寫入 `receipt_raw`；驗證取消時不建立支出
- [ ] 7.5 實作辨識失敗退回：依錯誤碼顯示對應文字，並開啟附有照片的手動新增畫面；以停用 API key 或改錯模型名稱模擬錯誤驗證
- [ ] 7.6 檢查打包後的前端與網路請求中不含 Gemini API key（`grep` build 輸出）

## 8. 結算（settlement）

- [x] 8.1 實作結算頁：最上方是個人在各幣別的摘要，接著依幣別分區列出轉帳建議（頭像 → 頭像、金額），最後是依幣別分列的總花費；以第 2 節的測試資料目視驗證
- [x] 8.2 實作「標記已付」寫入 settlements，並加上朱紅印章動畫（`prefers-reduced-motion` 時直接顯示）；驗證標記後該建議消失，且在系統開啟減少動態效果時沒有動畫
- [x] 8.3 實作還款紀錄列表與刪除；驗證刪除後對應建議重新出現
- [x] 8.4 實作全部結清狀態；驗證最後一筆標記已付後顯示全部結清，沒有任何支出時不顯示

## 9. PWA、部署與整體驗證

- [x] 9.1 設定 PWA manifest（名稱、圖示、車票綠主題色）與 service worker 快取靜態資源和字體；以 Lighthouse 驗證可安裝
- [ ] 9.2 部署 Supabase（migrations、開啟 anonymous sign-in、設定 secrets、部署 Edge Function）並將前端部署到靜態主機；在 README 記錄部署步驟與「免費專案閒置 7 天會暫停」的說明
- [ ] 9.3 以三支手機實際跑一次完整流程：建立旅程 → LINE 分享 → 加入選頭像 → 手動記帳與拍收據（JPY、TWD 混用）→ 即時同步 → 結算 → 標記已付 → 全部結清，並記錄發現的問題
- [ ] 9.4 用 frontend-design skill 的自我檢討流程，在手機上截圖檢查各主要畫面，修正偏離 design 第 8 節的地方

## Workflow follow-up

- 實作完成並驗證後，執行 `/openspec-archive-change` 封存這個 change，讓四個 capability 成為正式 spec。
