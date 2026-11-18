# Tasks

## 1. 報告腳本

- [x] 1.1 新增 `scripts/scenario-report.ts` 的解析函式：讀規格（Requirement、Scenario、唯一性檢查）、讀 E2E 標題、讀 Vitest 與 pgTAP 的 `@scenario` 標註，回傳對應與錯誤（含檔案與行號、最接近的 Scenario 名稱）；在 `scripts/scenario-report.test.ts` 用 Vitest 測試支援的寫法與每一種錯誤，`npm test` 通過
- [x] 1.2 實作結果讀取（`reports/vitest.json`、`reports/e2e.json`、`reports/pgtap.txt`，缺少的檔案視為未執行）與 Scenario 結果判定（通過／失敗／未執行／未覆蓋），補上對應的單元測試並通過
- [x] 1.3 實作 Markdown 輸出（總表、每個 capability 的 `<details>`、未覆蓋清單）與 CLI 參數 `--check`、`--summary`、`--out`；加入 `package.json` 的 `scenarios`、`scenarios:check`；`tsconfig.node.json` 與 Vitest `include` 加入這兩個檔案；`npm run build`、`npm run lint`、`npm run format:check` 通過
- [x] 1.4 用目前的 repo 執行 `npm run scenarios:check`，確認 17 個 E2E 標題都對應成功；暫時把一個 E2E 標題改錯，確認會失敗並指出檔案與行號，再還原

## 2. 測試結果輸出

- [x] 2.1 `vite.config.ts` 讓 Vitest 同時輸出 `reports/vitest.json`，`playwright.config.ts` 加 JSON reporter 輸出 `reports/e2e.json`，`.gitignore` 加入 `reports/`；執行 `npm test` 與 `npm run test:e2e`（需要 `supabase start`）後確認兩個檔案存在，`npm run scenarios` 顯示 Vitest 與 E2E 的結果
- [x] 2.2 本機執行 `supabase test db | tee reports/pgtap.txt` 後，`npm run scenarios` 能顯示 pgTAP 檔案的結果；暫時讓一個 pgTAP 斷言失敗，確認對應的 Scenario 顯示失敗，再還原

## 3. 標註既有測試

- [x] 3.1 依 design 第 6 節，標註 `src/lib/*.test.ts` 與 `src/features/**/*.test.ts` 中的測試（`money`、`settle`、`avatars`、`identity`、`appUpdate`、`backTarget`、`shareLink`、`expense`、`receipt`、`settlement` 的 model／api），每個標註都對照規格中的 Scenario 內容；`npm run scenarios:check` 通過
- [x] 3.2 標註 `supabase/functions/parse-receipt/receipt.test.ts` 與 `supabase/tests/*.test.sql`；`npm run scenarios:check` 與 `supabase test db` 都通過
- [x] 3.3 執行全部測試後跑 `npm run scenarios`，記錄每個 capability 的覆蓋數，並列出拿不準而沒有標註的測試，寫在實作回報中

## 4. CI

- [x] 4.1 修改 `.github/workflows/ci.yml`：`check` job 加 `npm run scenarios:check` 並在 Vitest 後上傳 `reports/vitest.json`；`supabase` job 的 pgTAP 改成 `set -o pipefail` + `tee reports/pgtap.txt`，並上傳 `reports/pgtap.txt`、`reports/e2e.json`（都用 `if: always()`）；新增 `scenario-report` job（`needs: [check, supabase]`、`if: always()`，寫入 `$GITHUB_STEP_SUMMARY` 並上傳 `scenario-report.md`，保留 30 天）；用 `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -no-color` 檢查通過

## 5. 文件

- [x] 5.1 更新 `AGENTS.md` 的測試慣例（Vitest 與 pgTAP 用 `@scenario` 標註、新增 `npm run scenarios` 與 `scenarios:check`）、`docs/development.md`（標註寫法、報告怎麼看、本機怎麼產生、CI 的新 job）、`.claude/skills/check-placement/SKILL.md`（commit 前加跑 `npm run scenarios:check`）；用文件中的指令實際執行一次，確認可以照做

## 6. 整合驗證

- [x] 6.1 本機依序執行 `npm run lint`、`npm run format:check`、`npm run build`、`npm test`、`supabase test db`、`npm run test:e2e`、`npm run scenarios`，全部通過，報告內容與 3.3 一致
- [x] 6.2 經使用者同意 commit 並 push 後，確認 CI 的「Scenario 對照報告」job 在 Job Summary 顯示報告、`scenario-report.md` artifact 可以下載，且「相依套件安全檢查」以外的 job 都通過

## Workflow follow-up

- 審查通過後 archive 這個 change（`skip_specs: true`，不需同步主規格）。
- 之後的 change 可以依報告中的未覆蓋清單補測試。
