# Proposal

## Why

目前的測試（Vitest、pgTAP、lint、型別檢查）只在實作 change 時手動執行，沒有任何東西會在 push 時自動檢查。畫面與流程類的 Scenario 每次都靠瀏覽器手動驗證，沒有留下可以重跑的腳本，舊的 acceptance criteria 在之後的修改中不會被回歸測試。

## What Changes

- 新增 GitHub Actions CI：push 到 `main` 與開 Pull Request 時，自動執行 lint、`npm run build`（型別檢查 + 建置）、Vitest、pgTAP 與 Playwright E2E；任一項失敗即標示失敗。
- 新增 Playwright E2E：連到本機 Supabase（`supabase start`），以手機尺寸的瀏覽器走主要流程（擁有者登入與建立旅程、朋友加入、新增與刪除支出、即時同步、拍收據、辨識太忙、結算與標記已付、刪除旅程）。
- 收據辨識在 E2E 中攔截 `parse-receipt` 的請求並回傳固定結果，不呼叫 Gemini，也不需要 Gemini 金鑰。
- 每個 E2E 測試的名稱對應主規格的 Requirement 與 Scenario（例如「標記已付 › 標記已付」），讓規格和測試可以一一對照。
- 新增 `npm run test:e2e`，本機與 CI 用同一個指令執行。
- 本機 Supabase 的匿名登入頻率上限調高，避免重複執行 E2E 時被擋下（只影響 `supabase/config.toml` 的本機設定）。
- 更新 `docs/development.md`、`AGENTS.md` 與 `README.md` 的測試說明。

不做的事：

- 不在 CI 自動部署（Cloudflare 與 Supabase 仍由人工在審查後部署）。
- 不加 React 元件測試。
- E2E 不覆蓋全部 116 個 Scenario，只挑主要流程；其餘 Scenario 仍由 Vitest、pgTAP 或手動驗證。
- 不測真正的 Gemini 辨識結果，也不在 CI 執行 Edge Function。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

（無）

這次只新增開發工具與測試，App 的使用者可見行為不變，因此不修改任何規格，`.openspec.yaml` 設定 `skip_specs: true`。

## Impact

- 新增檔案：`.github/workflows/ci.yml`、`playwright.config.ts`、`e2e/`（測試、輔助程式與測試用收據圖片）、`tsconfig.e2e.json`。
- 修改：`package.json`（`@playwright/test` 開發依賴與 `test:e2e`）、`tsconfig.json`（加入 e2e 參照）、`.gitignore`（Playwright 報告與登入狀態）、`supabase/config.toml`（本機匿名登入上限）、`docs/development.md`、`AGENTS.md`、`README.md`。
- 不影響正式環境：App 程式碼、migrations、Edge Function 都不修改。
- CI 需要在 GitHub Actions 上啟動 Supabase 的 Docker 容器，每次執行約數分鐘；不需要任何 GitHub Secrets（只使用本機 Supabase 的預設金鑰）。
