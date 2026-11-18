# Design

## Context

- 主規格在 `openspec/specs/<capability>/spec.md`，格式固定：`### Requirement: <名稱>`，底下 `#### Scenario: <名稱>`。目前 6 個 capability、48 個 Requirement、116 個 Scenario；Requirement 名稱在所有規格中不重複，同一個 Requirement 底下的 Scenario 名稱也不重複。
- E2E（`e2e/<capability>.spec.ts`，17 個測試）的標題已經是「Requirement › Scenario」（`›` 是 U+203A）。Playwright reporter：CI 為 `github` + `html`，本機為 `list`。
- Vitest 測試在 `src/**/*.test.ts` 與 `supabase/functions/**/*.test.ts`（12 個檔案、75 個測試），標題是英文。設定在 `vite.config.ts` 的 `test`。
- pgTAP 在 `supabase/tests/*.test.sql`（4 個檔案、149 個斷言），用 `select no_plan()`，斷言沒有可以穩定引用的名稱；`supabase test db` 的輸出每個檔案一行，例如 `.../rls.test.sql ...... ok`。
- `scripts/*.ts` 用 Node 直接執行（型別剝除），目前沒有被任何 tsconfig 涵蓋。CI 的 Node 是 22.x，最新的 22.x 預設支援型別剝除。
- CI 有兩個測試 job：`check`（Vitest）與 `supabase`（pgTAP、E2E），結果分在不同機器上。

## Goals / Non-Goals

**Goals:**

- 一張表回答「每個 Scenario 由哪些測試驗證、這次結果如何」，在 CI 執行頁直接看得到。
- 規格與測試的對應失效時（改名、打錯字），CI 立刻失敗，而且在 `check` job 就能發現，不用等 E2E。
- 報告腳本不需要額外安裝套件，也不需要 OpenSpec CLI。

**Non-Goals:**

- 不追蹤 pgTAP 單一斷言的結果，只到檔案層級。
- 不支援在 `describe(` 上標註整組測試。

## Decisions

### 1. 對應方式

| 測試 | 對應方式 | 結果的粒度 |
|---|---|---|
| E2E | 測試標題本身就是 `Requirement › Scenario` | 單一測試 |
| Vitest | `it(`／`test(` 正上方的 `// @scenario Requirement › Scenario`，可以連續多行 | 單一測試 |
| pgTAP | 檔案中任意位置的 `-- @scenario Requirement › Scenario` | 整個檔案 |

Scenario 的識別鍵是「Requirement › Scenario」，不加 capability 名稱：E2E 已經用這個格式，名稱也全域唯一。腳本會檢查唯一性，如果之後出現重複，會報錯並要求改名。

替代方案：在測試標題中寫 Scenario（像 E2E 那樣）。缺點是要改掉 Vitest 的英文標題，而且一個測試常常驗證好幾個 Scenario，標題放不下。

替代方案：另外維護一個對照檔（JSON／YAML）。缺點是測試改名或刪除時，對照檔很容易忘記更新；註解和測試放在一起比較不會失效。

### 2. 腳本結構：靜態檢查與報告分開

`scripts/scenario-report.ts` 只用 Node 內建模組，有兩種模式：

- `--check`（`npm run scenarios:check`）：只讀原始碼，不需要測試結果。以下情況會讓它失敗並列出檔案與行號：
  - E2E 標題不是一個存在的 Scenario。
  - `@scenario` 指向不存在的 Scenario，或格式錯誤（缺少 `›`）。
  - Vitest 的 `@scenario` 後面接的不是 `it(`／`test(`（以字串字面值為標題）。
  - 規格中出現重複的「Requirement › Scenario」。
- 報告模式（`npm run scenarios`）：先做同樣的檢查，再讀取 `reports/` 底下現有的測試結果，輸出 Markdown。可以用 `--summary <檔案>` 附加到 Job Summary，用 `--out <檔案>` 另存。

解析規則刻意保持簡單（逐行比對），只支援上面列出的寫法，遇到不支援的寫法就報錯，而不是默默忽略。

解析與比對寫成純函式，放在同一個檔案匯出，由 `scripts/scenario-report.test.ts` 測試；`tsconfig.node.json` 與 Vitest 的 `include` 加入這兩個檔案（不加入其他既有腳本，避免把它們的型別問題帶進來）。

### 3. 測試結果的來源

| 測試 | 怎麼產生 | 檔案 |
|---|---|---|
| Vitest | `vite.config.ts` 加 `reporters: ['default', 'json']` 與 `outputFile.json` | `reports/vitest.json` |
| E2E | `playwright.config.ts` 本機與 CI 都加 `['json', { outputFile }]` | `reports/e2e.json` |
| pgTAP | CI 用 `set -o pipefail; supabase test db \| tee reports/pgtap.txt` | `reports/pgtap.txt` |

不放在 `test-results/`，因為 Playwright 每次執行前會清空它。`reports/` 加入 `.gitignore`。

比對方式：Vitest 用「檔案路徑 + 測試標題」，同一個檔案中有同名測試時報錯；E2E 用標題；pgTAP 用檔名。

### 4. 每個 Scenario 的結果

- **通過**：至少一個對應的測試有結果，而且有結果的都通過。
- **失敗**：任一個對應的測試失敗。
- **未執行**：有對應，但沒有任何結果（例如本機沒跑 E2E，或 CI 中前面的 job 中途停止）。
- **未覆蓋**：沒有任何測試對應。

報告開頭是總表（每個 capability 的 Scenario 數、已覆蓋、通過、失敗），接著每個 capability 一個可展開的 `<details>` 區塊，最後列出全部未覆蓋的 Scenario。

### 5. CI

- `check` job：在 lint 之後執行 `npm run scenarios:check`；Vitest 執行後上傳 `reports/vitest.json`（`if: always()`）。
- `supabase` job：pgTAP 改為寫入 `reports/pgtap.txt`；結束時上傳 `reports/pgtap.txt` 與 `reports/e2e.json`（`if: always()`）。
- 新增 `scenario-report` job（「Scenario 對照報告」）：`needs: [check, supabase]`、`if: always()`，只做 checkout、setup-node、下載上面兩個 artifact、執行報告並寫入 `$GITHUB_STEP_SUMMARY`、上傳 `scenario-report.md`（保留 30 天）。不需要 `npm ci`。
- 報告 job 不因測試失敗或未覆蓋而失敗；對應錯誤已經由 `check` job 擋下。

替代方案：把報告放在 `supabase` job 的最後。缺點是拿不到 `check` job 的 Vitest 結果，而且 `supabase` job 失敗時報告就不會產生。

### 6. 標註既有測試的原則

只標註「這個測試的斷言確實能讓該 Scenario 失敗」的情況。例如 `settle.test.ts` 驗證最少轉帳演算法，可以標註「最少轉帳建議 › 產生轉帳建議」；只是共用輔助函式的測試，不硬湊對應。拿不準的不標註，在實作回報中列出來讓 Lead 判斷。

## Risks / Trade-offs

- [註解寫法不符合解析規則就被忽略，造成覆蓋率被低估] → 不支援的寫法一律報錯，不默默忽略；並有單元測試涵蓋支援與不支援的寫法。
- [Requirement 名稱很長，標註容易打錯] → `--check` 會指出檔案與行號；錯誤訊息附上名稱最接近的 Scenario。
- [規格改名後，所有相關測試都要一起改] → 這正是想要的行為；改名的 change 本來就應該同步測試。
- [pgTAP 只有檔案層級，一個斷言失敗會讓整個檔案對應的 Scenario 都顯示失敗] → 可接受；pgTAP 失敗本來就需要人工查看。
- [CI 的 Node 22 若低於 22.18 不支援型別剝除] → `setup-node` 的 `22` 會取得最新的 22.x；報告 job 若失敗會在第一次 CI 就發現。
