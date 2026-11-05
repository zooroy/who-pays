# Tasks

## 1. 資料庫：修改成員

- [x] 1.1 新增 migration `update_member(member_id, name, avatar_id)`（design 第 5 節），並在 `supabase/tests/` 加入 pgTAP 測試：有權限可改名與換頭像、換成已使用頭像回 `AVATAR_TAKEN`、無 `trip_access` 或成員不存在回 `TRIP_ACCESS_DENIED`、空白名字被拒；以 `supabase db reset && supabase test db` 全部通過驗證
- [x] 1.2 在 `src/features/trip/api.ts` 新增 `updateMember`，`README.md` 的 RPC 契約補上 `update_member`；以 `npm run build` 通過驗證

## 2. 名字選填

- [x] 2.1 抽出「名字留空時以頭像名稱代替」的純函式並以 Vitest 測試（空字串、只有空白、有填名字三種情況）；`CreateTrip` 與 `MemberForm` 改用它，欄位標示為「名字（選填）」並以所選頭像名稱作為 placeholder；以 `npm test` 通過，並在瀏覽器確認只選頭像即可建立旅程、加入旅程與新增朋友

## 3. 我的旅程與用連結開啟

- [x] 3.1 實作分享連結解析純函式（完整網址、無協定網址、只有 token、無效文字），以 Vitest 測試涵蓋 spec「貼上無效的連結」情境；以 `npm test` 通過驗證
- [x] 3.2 新增 `getMyTrips`（design 第 1 節，嵌入 `members(id, avatar_id)`）與「我的旅程」首頁：有旅程時列出車票、建立新旅程按鈕、用連結開啟；沒有旅程時直接顯示建立表單與用連結開啟；路由改為 `/` 首頁、`/new` 建立表單；在瀏覽器確認 spec「列出已參加的旅程」「建立第二個旅程」「第一次使用」三個情境
- [x] 3.3 首頁「用旅程連結開啟」：文字欄位、開啟按鈕與「貼上剪貼簿的連結」按鈕（不支援時隱藏）；在瀏覽器以全新的瀏覽器設定檔（模擬主畫面 App）貼上連結並認領既有成員，確認進入旅程且回首頁後列表出現該旅程
- [x] 3.4 `AppShell` 新增返回「我的旅程」入口，旅程頁與 `/new` 顯示；找不到旅程的畫面改連到首頁；成員面板的提示文字補上主畫面 App 需貼一次連結的說明；在瀏覽器確認「從旅程回到首頁」與「無效連結」情境

## 4. 成員面板：編輯成員與切換身份

- [x] 4.1 成員面板中每位成員可進入編輯，`MemberForm` 支援初始值與「自己目前頭像視為可選」，儲存呼叫 `updateMember`；以兩個瀏覽器確認 spec「修正佔位成員的名字」「更換自己的頭像」「換成已被使用的頭像」三個情境，且另一個瀏覽器即時看到新名字與頭像
- [x] 4.2 切換身份改為面板內先選成員再更換、提供取消、不再呼叫 `clearIdentity`、目前身份標示為「目前」且不可選；在瀏覽器確認 spec「切換身份」「取消切換身份」情境

## 5. 新 icon

- [x] 5.1 由 Codex 依 ip-as-logo 流程（design 第 7 節）提出三個方向並經使用者確認後產生六張候選，使用者選定一張；交付至少 1024×1024 的原圖供審查（不放進 `public/`，定稿後才由 5.2 產生正式檔）
- [x] 5.2 由選定原圖產生 `favicon.png`、`pwa-192.png`、`pwa-512.png`、`apple-touch-icon.png`，並另外產生角色置中於 80% 安全區的 `pwa-maskable-512.png`；以截圖確認 32×32 可辨識、maskable 圓形遮罩下角色完整

## 6. 整合驗證與部署

- [x] 6.1 `npm run lint`、`npm test`、`npm run build`、`supabase test db` 全部通過；`supabase db push` 套用 migration 到正式環境並 `npm run deploy`（由使用者執行），以 curl 確認正式網站載入新版
- [ ] 6.2 使用者以 iPhone 確認：Safari 中可回首頁並建立第二個旅程；主畫面 App 重新加入後顯示新 icon，第一次打開可貼上連結接回旅程與身份；編輯成員與取消切換身份正常

## Workflow follow-up

- 使用者確認 6.2 後，以 `/openspec-archive-change` 封存此 change，並將 delta spec 同步到 `openspec/specs/trip-membership/spec.md`。
