# Design

## Context

- `.github/workflows/ci.yml` 有兩個平行的 job：`check`（`npm ci`、lint、build、Vitest）和 `supabase`（pgTAP、E2E），權限是 `contents: read`，觸發於 push 到 `main` 與 `pull_request`。
- `npm run format:check` 檢查 `src scripts e2e playwright.config.ts`；`.prettierignore` 排除 `dist`、`supabase/`、`openspec/`、`*.md`。目前只有 `scripts/owner.ts` 不符格式，Prettier 會改動 1 行。
- `npm audit` 目前結果：4 個 moderate，0 個 high／critical。全部來自 `vite-plugin-pwa` 的建置相依套件。
- Repo 是公開的（`zooroy/who-pays`），CodeQL 與 Dependabot 可以免費使用。

## Goals / Non-Goals

**Goals:**

- 格式、相依套件漏洞、程式碼安全問題都在 push／PR 時自動檢查，在 GitHub 上看得到是哪一項失敗。
- 套件即使沒有任何 commit，也能透過 Dependabot alerts 與每週的 CodeQL 掃描發現新的漏洞。

**Non-Goals:**

- 不做 secret scanning 的自訂規則。公開 repo 的 GitHub 預設 secret scanning 已經開啟，這次不改。
- 不做容器或基礎設施掃描，這個專案沒有自己的映像檔。

## Decisions

### 1. 格式檢查放在 `check` job

在 `npm run lint` 後面加一步 `npm run format:check`。不需要另外安裝東西，只多花幾秒。

替代方案：獨立一個 job。缺點是要多跑一次 `npm ci`，換來的資訊量不值得。

### 2. `npm audit` 用獨立的 `security` job，門檻設 high

```yaml
security:
  name: 相依套件安全檢查
  steps: checkout → setup-node → npm audit --audit-level=high
```

- **不需要 `npm ci`**：`npm audit` 只讀 `package-lock.json`，所以這個 job 很快。
- **包含開發相依套件**：建置工具和測試工具都會在 CI 和開發者電腦上執行，有漏洞一樣會造成風險。
- **門檻 high**：moderate 等級的問題常常沒有不破壞相容性的修法，例如目前的 `vite-plugin-pwa`。如果門檻設成 moderate，現在就會失敗，也會讓不相關的 PR 卡住。
- **獨立 job**：失敗時名稱直接顯示「相依套件安全檢查」，不會和 lint 錯誤混在一起。

替代方案：只靠 Dependabot alerts。缺點是 alerts 不會讓 PR 失敗，新增一個有漏洞的套件時不會被擋下來。

### 3. CodeQL 用 workflow 檔（advanced setup）

新增 `.github/workflows/codeql.yml`，使用 `github/codeql-action` v3 的 `init` 與 `analyze`：

- **觸發**：push 到 `main`、`pull_request`、每週一次 `schedule`。
- **語言**：`javascript-typescript` 和 `actions`，都用 `build-mode: none`，不需要建置。
- **權限**：`security-events: write`、`contents: read`、`actions: read`。

替代方案：在 repo 設定開 CodeQL default setup。缺點是設定不在 repo 裡，看不到也不能審查，所以選 workflow 檔。注意：兩者不能同時開啟，否則 advanced setup 的上傳會被拒絕。

### 4. Dependabot：版本更新寫在 repo，安全更新在設定開啟

`.github/dependabot.yml`：

- `npm`：每週，`groups` 把 minor／patch 合併成一個 PR，major 各自一個 PR，`open-pull-requests-limit: 5`。
- `github-actions`：每週，全部合併成一個 PR。

Dependabot alerts 與 security updates 是 repo 設定，不能寫在檔案裡。可以在 GitHub 的 Settings → Code security 開啟，也可以在使用者同意後用 `gh api` 開啟（`PUT /repos/{owner}/{repo}/vulnerability-alerts`、`PUT /repos/{owner}/{repo}/automated-security-fixes`）。

Dependabot 的 PR 會跑完整 CI。`supabase` job 不需要 secrets，所以 Dependabot 的 PR 也能正常執行。

### 5. `scripts/owner.ts` 只跑 Prettier

直接執行 `npx prettier --write scripts/owner.ts`，不改任何邏輯。

## Risks / Trade-offs

- [新的 high 漏洞公告會讓原本通過的 CI 突然失敗，即使 PR 沒有改套件] → 這是預期的行為，代表需要升級。如果暫時沒有修法，可以在 PR 中說明，再決定是否改用 `npm audit` 的 `--omit=dev` 或暫時降低門檻。不預先加例外清單。
- [Dependabot PR 數量增加] → 用 groups 合併 minor／patch，並限制同時開啟的數量。
- [CodeQL 讓每次 PR 多花幾分鐘] → 它和其他 job 平行執行，不會延長整體等待時間太多；而且 `build-mode: none` 不需要建置。
- [CodeQL 誤報] → 結果只出現在 Security 分頁和 PR 的檢查中，可以在 GitHub 上標記為誤報（dismiss）。
