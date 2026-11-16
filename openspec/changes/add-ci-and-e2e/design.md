# Design

## Context

- 現有測試：Vitest（`src/**/*.test.ts`、`supabase/functions/**/*.test.ts`）、pgTAP（`supabase/tests/*.sql`）、oxlint、`tsc -b`。都只在本機手動執行，repo 沒有 `.github/workflows`，也沒有 git hook。
- 前端只透過 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY` 連到 Supabase（`src/lib/supabase.ts`），本機與正式環境只差這兩個值。
- 朋友第一次開啟時會匿名登入；擁有者用 email／密碼登入，帳號必須存在於 `app_owners`（`scripts/create-local-owner.ts` 用 service role key 建立）。
- 本機 `supabase/config.toml` 的匿名登入上限是每小時每個 IP 30 次；E2E 每個朋友的瀏覽器 context 都會建立一個新的匿名使用者。
- 收據辨識：前端先把照片上傳到 Storage，再用 `supabase.functions.invoke('parse-receipt')` 取得結果（`src/features/receipt/api.ts`），結果必須通過 `isReceiptResult`，錯誤以 JSON body 的 `code`（例如 `MODEL_BUSY`）表示。
- PWA 的 service worker 只在建置後註冊，dev server 不會註冊。

## Goals / Non-Goals

**Goals:**

- push 與 PR 都會自動執行全部檢查，失敗時在 GitHub 上看得到是哪一步、哪個測試。
- E2E 在本機與 CI 用同一個指令、同一份設定執行，不需要手動複製金鑰。
- 測試名稱可以直接對回主規格的 Scenario。

**Non-Goals:**

- 不在 CI 測 WebKit／iPhone 實機；iOS 特有的行為（加到主畫面、LINE 開啟 Safari、自動更新）仍在 iPhone 上手動驗證。
- 不做視覺比對（screenshot diff）。
- 不在 E2E 驗證 app-updates 的 Scenario（需要兩個建置版本，成本高）。

## Decisions

### 1. CI 分成兩個 job

`.github/workflows/ci.yml`，觸發於 push 到 `main` 與 `pull_request`：

- **check**：`npm ci` → `npm run lint` → `npm run build` → `npm test`。不需要 Docker，約 1 分鐘內給出結果。
- **supabase**：`supabase/setup-cli` 安裝 CLI → `supabase start`（排除 Studio、Edge Runtime 與記錄相關的服務，加快啟動）→ `supabase test db` → `npx playwright install --with-deps chromium` → `npm run test:e2e`。失敗時上傳 Playwright HTML 報告與 trace 作為 artifact。

兩個 job 平行執行。Node 版本與本機一致（22.x，`actions/setup-node` 開啟 npm 快取）。

替代方案：全部放在同一個 job。缺點是 lint 或型別錯誤要等 Supabase 啟動完才知道，所以拆開。

### 2. E2E 的 Supabase 金鑰從 `supabase status` 取得

`e2e/localSupabase.ts` 執行 `supabase status -o json`，取出 `API_URL`、`ANON_KEY`、`SERVICE_ROLE_KEY`，並檢查網址的主機必須是 `127.0.0.1` 或 `localhost`，否則直接拋出錯誤。`playwright.config.ts` 用它設定 dev server 的環境變數 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（Vite 會讀取 `process.env` 中的 `VITE_` 變數，優先於 `.env.local`）。

這樣本機和 CI 都不需要 GitHub Secrets 或手動填 `.env.local`，也不可能誤連到正式環境。

替代方案：在 CI 寫一個步驟產生 `.env.local`。缺點是本機要另外處理，兩邊流程不一致。

### 3. 用 Vite dev server 執行

Playwright 的 `webServer` 啟動 `npm run dev -- --port 5174 --strictPort`（避開平常開發用的 5173），`reuseExistingServer` 在本機為 true、CI 為 false。瀏覽器 context 設定 `serviceWorkers: 'block'`。

替代方案：`vite build` 後用 `vite preview`。比較接近正式環境，但每次都要重新建置，而且會註冊 service worker；建置本身已經由 check job 驗證。

### 4. 只用 Chromium，手機尺寸

一個 project：Chromium，viewport 390×844、`isMobile`、`hasTouch`、`locale: 'zh-TW'`。WebKit 在 Linux 上的行為與 iOS Safari 仍有差距，不足以取代實機驗證，這次不加。

### 5. 擁有者帳號與登入狀態

- `e2e/global-setup.ts`：用 service role key 建立（或沿用）測試擁有者 `e2e-owner@example.test` 並寫入 `app_owners`，邏輯與 `scripts/create-local-owner.ts` 相同。測試密碼寫在 `e2e/fixtures/owner.ts`，只用於本機 Supabase。
- 擁有者的測試用 Playwright fixture `ownerPage`：在新 context 走一次 `/login` 登入。登入流程本身就是要測的 Scenario，不另外存 storageState 檔案。
- 朋友用另一個全新的 context（新的匿名使用者），fixture `friendPage`。

### 6. 測試資料互不干擾

每個測試自己建立旅程，旅程名稱加上隨機後綴（例如「E2E 台南之旅 a1b2」），測試之間不共用資料，可以平行執行。不在測試結束時刪除資料：CI 每次都是新的資料庫；本機需要時用 `supabase db reset` 清掉。

常用步驟放在 `e2e/helpers.ts`：`createTrip(ownerPage, name)` 回傳分享連結、`joinTrip(friendPage, url, name)`、`addExpense(page, …)`。全部透過畫面操作，不直接呼叫 RPC，讓輔助函式本身也驗證 UI。

### 7. 收據辨識用 route 攔截

`page.route('**/functions/v1/parse-receipt', …)` 回傳固定結果：

- 成功：`e2e/fixtures/receipt-result.json`，內容必須通過 `isReceiptResult`（店名、日期、幣別 JPY、總額、兩個品項含中文翻譯）。
- 太忙：HTTP 503，body `{ "code": "MODEL_BUSY" }`。

照片上傳仍然打到本機 Storage（是真實流程的一部分），使用 `e2e/fixtures/receipt.jpg`（一張小的 JPEG）透過 `setInputFiles` 選擇。

替代方案：在 CI 跑 `supabase functions serve` 並設定假的 Gemini 回應。需要改 Edge Function 才能注入假資料，這次不做；Edge Function 的邏輯已由 `receipt.test.ts` 覆蓋。

### 8. 測試命名與涵蓋範圍

檔案依主規格分：`e2e/<capability>.spec.ts`。`test.describe` 用 capability 名稱，`test` 的標題用「<Requirement> › <Scenario>」，與主規格的標題完全一致，方便用 `grep` 從 Scenario 找到測試。

這次涵蓋的 Scenario：

| 檔案 | Requirement › Scenario |
|---|---|
| `owner-account.spec.ts` | 擁有者登入 › 擁有者登入；擁有者登入 › 密碼錯誤；只有擁有者能建立旅程 › 朋友無法建立旅程；刪除旅程 › 擁有者刪除旅程；刪除旅程 › 取消刪除 |
| `trip-membership.spec.ts` | 建立旅程 › 成功建立旅程；透過連結加入 › 新成員加入；頭像唯一 › 頭像已被選走；回到上一層 › 從支出明細回到列表 |
| `expense-tracking.spec.ts` | 新增支出 › 手動新增支出；新增支出 › 金額無效；修改與刪除支出 › 刪除支出；即時同步 › 他人新增支出 |
| `receipt-scanning.spec.ts` | 確認畫面 › 確認後儲存；辨識失敗退回手動輸入 › 辨識服務太忙 |
| `settlement.spec.ts` | 最少轉帳建議 › 產生轉帳建議；標記已付 › 標記已付 |

選擇的原則：每個 capability 至少有一條成功路徑，加上過去出過問題或只能手動驗證的情境（即時同步、辨識太忙、刪除旅程）。

選取元素時優先用 `getByRole` 與畫面上的中文文字（例如按鈕「儲存支出」），不新增 `data-testid`，所以不需要修改 App 程式碼。

### 9. 型別檢查與 lint

新增 `tsconfig.e2e.json`（include `e2e`、`playwright.config.ts`，types `node`），加入 `tsconfig.json` 的 references，讓 `npm run build` 的 `tsc -b` 一起檢查 E2E 程式碼。oxlint 本來就會掃整個專案。Vitest 的 `include` 只有 `src/**` 與 `supabase/functions/**`，E2E 檔名用 `*.spec.ts`，不會被 Vitest 執行。

## Risks / Trade-offs

- [CI 啟動 Supabase 慢（下載映像檔）] → 排除用不到的服務；第一次之後 GitHub runner 仍需重新下載，接受數分鐘的執行時間。
- [即時同步測試可能不穩定] → 用 Playwright 的自動等待（`expect(...).toBeVisible()`，逾時 10 秒），不寫固定的 sleep；CI 設定 `retries: 1`，並保留 trace 方便查看。
- [調高本機匿名登入上限] → 只改 `supabase/config.toml`，正式環境的設定在 Supabase Dashboard。這個專案沒有使用 `supabase config push`，在 `docs/development.md` 註明不要用它把本機設定推到正式環境。
- [UI 文字修改會讓 E2E 失敗] → 這是預期的：文字是規格的一部分，改文字時應該一起更新規格與測試。
- [測試用擁有者密碼寫在 repo 裡] → 只存在本機與 CI 的臨時 Supabase，`e2e/localSupabase.ts` 拒絕連到非本機的網址。

## Migration Plan

1. 本機完成並執行 `npm run test:e2e` 全部通過。
2. commit 並 push 到 `main`，在 GitHub Actions 確認兩個 job 都成功。
3. 不需要部署；若 CI 設定有問題，revert 該 commit 即可，不影響正式網站。
