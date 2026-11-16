# Tasks

## 1. Playwright 基礎設定

- [x] 1.1 加入 `@playwright/test` 開發依賴與 `npm run test:e2e`（`playwright test`），安裝 Chromium。驗證：`npx playwright --version` 有輸出；`npm test` 仍只執行 Vitest
- [x] 1.2 新增 `e2e/localSupabase.ts`，從 `supabase status -o json` 取得網址與金鑰，拒絕非本機主機（design 第 2 節）。驗證：本機 `supabase start` 後執行可印出 `http://127.0.0.1:54321`；把網址改成非本機時拋出錯誤
- [x] 1.3 新增 `playwright.config.ts`：dev server 在 5174 埠、環境變數來自 1.2、Chromium 390×844 手機設定、`serviceWorkers: 'block'`、CI 時 `retries: 1` 與保留 trace（design 第 3、4 節）；`.gitignore` 加上 `playwright-report/`、`test-results/`。驗證：先寫一個開啟 `/` 看到「我的旅程」的暫時測試，`npm run test:e2e` 通過後刪除
- [x] 1.4 新增 `tsconfig.e2e.json` 並加入 `tsconfig.json` 的 references（design 第 9 節）。驗證：`npm run build` 通過；在 `e2e/` 故意寫一個型別錯誤時 `npm run build` 失敗
- [x] 1.5 `supabase/config.toml` 調高本機 `anonymous_users` 上限。驗證：`supabase stop && supabase start` 後連續執行兩次 `npm run test:e2e` 都不會出現匿名登入的頻率錯誤

## 2. 測試輔助與擁有者帳號

- [x] 2.1 新增 `e2e/global-setup.ts` 與 `e2e/fixtures/owner.ts`，建立或沿用測試擁有者並寫入 `app_owners`（design 第 5 節）。驗證：在乾淨的 `supabase db reset` 後執行與重複執行都成功，`app_owners` 有該使用者
- [x] 2.2 新增 `e2e/fixtures.ts`（`ownerPage`、`friendPage`）與 `e2e/helpers.ts`（`createTrip`、`joinTrip`、`addExpense`，旅程名稱加隨機後綴），只用 `getByRole` 與畫面文字選取元素，不修改 App 程式碼（design 第 5、6、8 節）。驗證：由第 3 組的測試使用並通過
- [x] 2.3 新增 `e2e/fixtures/receipt.jpg`（小尺寸 JPEG）與 `e2e/fixtures/receipt-result.json`（design 第 7 節）。驗證：在 Vitest 加一個測試確認該 JSON 通過 `isReceiptResult`（放在 `src/features/receipt/model.test.ts`）

## 3. E2E 測試

每個測試的標題用「<Requirement> › <Scenario>」，與主規格完全一致（design 第 8 節）。

- [x] 3.1 `e2e/owner-account.spec.ts`：擁有者登入 › 擁有者登入、擁有者登入 › 密碼錯誤、只有擁有者能建立旅程 › 朋友無法建立旅程、刪除旅程 › 擁有者刪除旅程、刪除旅程 › 取消刪除。驗證：`npm run test:e2e -- owner-account` 通過
- [x] 3.2 `e2e/trip-membership.spec.ts`：建立旅程 › 成功建立旅程、透過連結加入 › 新成員加入、頭像唯一 › 頭像已被選走、回到上一層 › 從支出明細回到列表。驗證：`npm run test:e2e -- trip-membership` 通過
- [x] 3.3 `e2e/expense-tracking.spec.ts`：新增支出 › 手動新增支出、新增支出 › 金額無效、修改與刪除支出 › 刪除支出、即時同步 › 他人新增支出（擁有者與朋友兩個 context，不重新整理即看到新支出）。驗證：`npm run test:e2e -- expense-tracking` 通過，並以 `--repeat-each 5` 確認即時同步測試穩定
- [x] 3.4 `e2e/receipt-scanning.spec.ts`：確認畫面 › 確認後儲存（攔截回傳成功結果，確認畫面帶入店名、總額與中文品項，儲存後列表出現該筆）、辨識失敗退回手動輸入 › 辨識服務太忙（攔截回傳 503 `MODEL_BUSY`，看到「自動辨識現在太忙，請稍後再試或手動輸入。」並保留照片）。驗證：`npm run test:e2e -- receipt-scanning` 通過，且測試期間沒有任何請求送到 Gemini
- [x] 3.5 `e2e/settlement.spec.ts`：最少轉帳建議 › 產生轉帳建議、標記已付 › 標記已付（標記後該筆建議消失）。驗證：`npm run test:e2e -- settlement` 通過
- [x] 3.6 檢查規格對應：每個測試標題都能在 `openspec/specs/` 找到同名的 Scenario。驗證：用指令列出所有測試標題的 Scenario 部分並逐一 `grep` 主規格，全部找得到

## 4. GitHub Actions CI

- [x] 4.1 新增 `.github/workflows/ci.yml`，`check` 與 `supabase` 兩個 job，失敗時上傳 Playwright 報告（design 第 1 節）。驗證：本機用 `actionlint`（或 `npx yaml-lint`）檢查格式沒有錯誤
- [ ] 4.2 確認 CI 會擋下錯誤。驗證：在暫時分支上故意讓一個 Vitest 與一個 E2E 測試失敗並 push，兩個 job 分別失敗、報告可下載；刪除該分支

## 5. 文件

- [x] 5.1 `docs/development.md` 新增 E2E 與 CI 的說明（如何執行、`supabase db reset` 清測試資料、測試命名規則、不要用 `supabase config push`）；`AGENTS.md` 的常用指令加上 `npm run test:e2e`，慣例加上 E2E 檔名與命名規則；`README.md` 技術表的測試列加上 Playwright 與 CI。驗證：照 `docs/development.md` 的步驟在本機從頭執行一次可以跑完

## 6. 整體驗證

- [ ] 6.1 本機執行 `npm run lint`、`npm run build`、`npm test`、`supabase test db`、`npm run test:e2e` 全部通過；push 到 `main` 後 GitHub Actions 兩個 job 都成功

## Workflow follow-up

- 審查通過後 archive 這個 change（`skip_specs: true`，不需要同步主規格），並執行 `openspec validate --specs --strict`。
- 這次不需要部署；之後新的 change 在 `tasks.md` 的驗證中，畫面流程類的 Scenario 改為「新增或更新對應的 E2E 測試，CI 通過」。
