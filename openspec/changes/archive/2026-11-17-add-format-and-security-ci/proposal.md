# Proposal

## Why

CI 目前只跑 lint、型別檢查、Vitest、pgTAP 與 E2E。格式檢查只能靠開發者自己記得在本機跑，所以 `scripts/owner.ts` 一直沒有通過 `npm run format:check` 也沒人發現。相依套件的漏洞和程式碼中的安全問題也完全沒有自動掃描。這個 repo 是公開的，GitHub 的安全掃描服務可以免費使用。

## What Changes

- CI 的「Lint、型別檢查、Vitest」job 加入 `npm run format:check`，格式不符就失敗。
- 修正 `scripts/owner.ts` 既有的格式問題，讓格式檢查一開始就能通過。
- CI 新增「相依套件安全檢查」job：執行 `npm audit --audit-level=high`。只要出現 high 或 critical 等級的漏洞就失敗；moderate 以下只顯示，不讓 CI 失敗。
- 新增 CodeQL 程式碼掃描 workflow：push 到 `main`、開 Pull Request 時執行，另外每週執行一次。掃描 JavaScript／TypeScript 與 GitHub Actions workflow，結果顯示在 GitHub 的 Security 分頁。
- 新增 Dependabot 設定：每週檢查 npm 套件與 GitHub Actions 的新版本並開 PR。minor／patch 更新合併成一個 PR，減少 PR 數量。
- 在 repo 設定中開啟 Dependabot alerts 與 security updates。這是 GitHub 帳號設定，由使用者操作或同意後執行。
- 更新 `docs/development.md` 的 CI 段落、`README.md` 的 CI 說明，以及 `.claude/skills/check-placement/SKILL.md` 的分工表。

不做的事：

- 不在 CI 自動修正格式，也不自動合併 Dependabot 的 PR，都由人工審查。
- 不處理目前 4 個 moderate 等級的漏洞（來自 `vite-plugin-pwa` → `workbox-build` → `glob`／`minimatch`，修正需要降版 `vite-plugin-pwa`）。這些只在建置時使用，不會進入使用者瀏覽器。
- 不擴大 Prettier 的檢查範圍（`supabase/` 與 Markdown 維持被 `.prettierignore` 排除）。
- 不加 git hook，本地檢查仍依 `check-placement` skill 手動執行。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

（無）

這次只調整開發工具與 CI，App 的使用者可見行為不變，所以不修改任何規格，`.openspec.yaml` 設定 `skip_specs: true`。

## Impact

- 新增：`.github/workflows/codeql.yml`、`.github/dependabot.yml`。
- 修改：`.github/workflows/ci.yml`（格式檢查步驟、`security` job）、`scripts/owner.ts`（只調整格式）、`docs/development.md`、`README.md`、`.claude/skills/check-placement/SKILL.md`。
- GitHub repo 設定：開啟 Dependabot alerts 與 security updates。
- 不影響正式環境：App 程式碼、migrations、Edge Function 都不修改，也不需要 GitHub Secrets。
- 之後會開始收到 Dependabot 的 PR，每個 PR 都會跑完整 CI。
