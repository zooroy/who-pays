# Proposal

## Why

主規格共有 116 個 Scenario，是這個專案的驗收標準，但目前答不出「哪些 Scenario 有自動測試、這次 CI 有沒有通過」。只有 E2E 的 17 個測試標題能對上 Scenario；Vitest（12 個檔案）與 pgTAP（4 個檔案）其實驗證了不少邏輯與權限的 Scenario，卻沒有任何對應紀錄。規格改名時，舊的對應也會默默失效，沒有東西會發現。

## What Changes

- 新增 `scripts/scenario-report.ts`：讀取 `openspec/specs/*/spec.md` 的所有 Requirement 與 Scenario，收集三種測試的對應，產生 Markdown 對照表。
  - **E2E**：測試標題「Requirement › Scenario」（現有慣例）。
  - **Vitest**：在 `it(`／`test(` 上方加註解 `// @scenario Requirement › Scenario`，一個測試可以標註多個 Scenario。
  - **pgTAP**：在 SQL 中加註解 `-- @scenario Requirement › Scenario`，以檔案為單位對應。
- 報告內容：依 capability 分組，列出每個 Scenario 由哪些測試驗證與結果（通過／失敗／未執行），以及每個 capability 與整體的覆蓋數；未覆蓋的 Scenario 另外列出。
- **只有錯誤的對應會讓檢查失敗**：E2E 標題或 `@scenario` 標註指向不存在的 Scenario、標註後面沒有測試、或標註格式錯誤。未覆蓋的 Scenario 只列出，不讓 CI 失敗。
- 標註現有的 Vitest 與 pgTAP 測試，對應到它們實際驗證的 Scenario。
- CI：
  - 「Lint、型別檢查、Vitest」job 先跑對應檢查（不需要測試結果，幾秒內完成）。
  - Vitest、pgTAP、E2E 輸出機器可讀的結果，新增「Scenario 對照報告」job，在前兩個 job 結束後（不論成敗）合併結果，寫入 GitHub Actions 的 Job Summary，並上傳 `scenario-report.md` artifact。
- 新增 `npm run scenarios`（本機產生報告）與 `npm run scenarios:check`（只檢查對應）。
- 更新 `AGENTS.md`、`docs/development.md`、`.claude/skills/check-placement/SKILL.md` 的測試慣例。

不做的事：

- 不為了提高覆蓋率而新增測試。這次只標註既有測試，覆蓋率低的地方留給之後的 change。
- 不設最低覆蓋率門檻。
- 不記錄手動驗證的 Scenario（例如 iPhone 實機行為），它們在報告中顯示為未覆蓋。
- 不修改 Vitest 與 pgTAP 測試的標題或內容，只加註解。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

（無）

這次只新增開發與 CI 工具，App 的使用者可見行為不變，所以不修改任何規格，`.openspec.yaml` 設定 `skip_specs: true`。

## Impact

- 新增：`scripts/scenario-report.ts`、`scripts/scenario-report.test.ts`。
- 修改：`.github/workflows/ci.yml`、`package.json`（兩個 script）、`playwright.config.ts`（加 JSON reporter）、`vite.config.ts`（若需要 Vitest reporter 設定）、`.gitignore`、12 個 Vitest 測試檔與 4 個 pgTAP 檔（只加註解）、`AGENTS.md`、`docs/development.md`、`.claude/skills/check-placement/SKILL.md`。
- 不影響正式環境與 App 程式碼，不需要新的依賴套件或 GitHub Secrets。
- CI 多一個約 30 秒的 job；規格改名而沒有同步測試時，CI 會失敗。
