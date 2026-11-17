---
name: check-placement
description: 決定「誰付錢」專案的各種檢查（TypeScript、Lint、Unit／Component 測試、Playwright E2E、Security Scan）該在本地跑還是交給 CI，並依目前的開發階段執行對應的本地檢查。當使用者問「要跑哪些測試」「commit／push 前要檢查什麼」「這個檢查放本地還是 CI」「新增檢查要放哪裡」，或完成一段實作準備 commit 時使用。
---

# 檢查放在本地還是 CI

原則：**越快、越便宜的檢查越早跑；越慢、越完整的檢查交給 CI 把關。** 本地負責快速回饋，CI 負責合併前的最後確認，兩邊不是二選一。

## 分工表

| 檢查 | 本地 | CI（`.github/workflows/ci.yml`） | 理由 |
|---|---|---|---|
| TypeScript 型別 | 編輯器即時；commit 前跑 `npm run build` | `check` job 的 `npm run build` | 幾秒就有結果，錯誤越早發現越好 |
| Lint（oxlint） | commit 前跑 `npm run lint` | `check` job | 同上。本專案用 oxlint，不是 ESLint |
| 格式（Prettier） | commit 前跑 `npm run format:check`，失敗就 `npm run format` | `check` job | 本地幾秒就能修，CI 只是防漏 |
| Unit 測試（Vitest） | 開發中 `npx vitest`（watch）；commit 前 `npm test` | `check` job | 純邏輯，全部跑完只要幾秒 |
| Component 測試 | 目前沒有 | 目前沒有 | 畫面行為由 E2E 驗證；要新增時用 Vitest + Testing Library，放本地與 `check` job |
| 資料庫（pgTAP） | 改了 `supabase/migrations/` 或 RLS 時跑 `supabase test db` | `supabase` job | 需要本機 Supabase，只在動到資料庫時本地跑 |
| Playwright E2E | 只跑改到的流程：`npx playwright test e2e/<capability>.spec.ts` | `supabase` job 跑全部 | 全部跑比較慢；本地失敗時可用 `--ui`／`--headed` 直接看畫面 |
| Security Scan | 改了 `package.json`／`package-lock.json` 後跑 `npm audit --audit-level=high` | `security` job（`npm audit`）、`codeql.yml`（CodeQL，另每週一次）、Dependabot（每週開更新 PR） | CodeQL、Dependabot 是 GitHub 服務，只能在 CI 與 repo 設定 |

## 依階段執行

先用 `git status` 和 `git diff --name-only`（已 commit 的用 `git diff --name-only origin/main...HEAD`）看改了哪些檔案，再照下面挑要跑的檢查。**只跑該階段需要的，不要每次都跑全部。**

### 開發中（邊寫邊跑）

- 改 `src/lib/` 等純邏輯：`npx vitest <檔名>`
- 其餘仰賴編輯器的型別與 lint 提示，不必主動跑指令

### Commit 前（必跑，總共約數十秒）

```bash
npm run lint
npm run build
npm test
npm run format:check
```

再依改動範圍追加：

| 改到的檔案 | 追加 |
|---|---|
| `supabase/migrations/`、`supabase/tests/` | `supabase test db` |
| `src/features/<x>/`、`src/components/`、路由或畫面 | 對應的 `npx playwright test e2e/<capability>.spec.ts` |
| `e2e/`、`playwright.config.ts` | 改到的 spec |
| `package.json`、`package-lock.json` | `npm audit --audit-level=high` |

`src/features/` 與 capability 的對應：`trip` → `trip-membership`（刪除旅程在 `owner-account`）；`account` → `owner-account`；`expense` → `expense-tracking`；`receipt` → `receipt-scanning`；`settlement` → `settlement`。不確定時用 `grep -l` 找 `e2e/` 裡用到該畫面文字的 spec。

pgTAP 與 E2E 需要本機 Supabase：先 `orb start`、`supabase start`。

### Push 之後（交給 CI）

- CI 會跑全部 Vitest、pgTAP、E2E。不需要在本地重跑完整 E2E。
- 用 `gh run watch` 等結果（CI 與 CodeQL 是兩個 workflow）；失敗時用 `gh run view --log-failed` 看原因。E2E 失敗會有 `playwright-report` artifact，下載後用 `npx playwright show-report <路徑>` 查看。

## 新增檢查時放哪裡

依序判斷：

1. **跑完要多久？** 10 秒內 → 本地 commit 前也跑，同時加進 CI 的 `check` job。超過 1 分鐘 → 本地只跑相關部分，CI 跑全部。
2. **需要外部服務嗎？** 要 Supabase → CI 的 `supabase` job。要 GitHub 服務（CodeQL、Dependabot）→ 只能放 CI 或 repo 設定。
3. **會呼叫付費或正式環境的服務嗎？**（Gemini、正式 Supabase）→ 本地與 CI 都不跑，用 mock 取代。E2E 已用 `page.route` 攔截 `parse-receipt`，`e2e/localSupabase.ts` 拒絕非本機的網址。

加進 CI 等於改 `.github/workflows/ci.yml`，屬於範圍較大的變更：照專案流程開 OpenSpec change，並在 `docs/development.md` 的「CI」段落補說明。

## 回報格式

跑完後用繁體中文回報：

- 跑了哪些檢查、結果（通過／失敗，失敗附關鍵錯誤）
- 依改動範圍**刻意沒跑**的檢查與原因（例如「沒改 migration，略過 pgTAP」）
- 只會在 CI 執行的部分（完整 E2E、CodeQL、Dependabot）

不要自行 commit 或 push；這兩步要使用者同意。
