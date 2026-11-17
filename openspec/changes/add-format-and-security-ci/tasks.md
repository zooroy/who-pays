# Tasks

## 1. 格式檢查

- [x] 1.1 執行 `npx prettier --write scripts/owner.ts`，確認 `git diff scripts/owner.ts` 只有格式變動，且 `npm run format:check` 通過
- [x] 1.2 在 `.github/workflows/ci.yml` 的 `check` job 中，於 `npm run lint` 之後加入 `npm run format:check`；暫時把一個檔案改成不符格式，確認 `npm run format:check` 在本機會失敗，再還原

## 2. 相依套件安全檢查

- [x] 2.1 在 `.github/workflows/ci.yml` 新增 `security` job（名稱「相依套件安全檢查」：checkout、setup-node 22、`npm audit --audit-level=high`，`timeout-minutes: 5`）；本機執行 `npm audit --audit-level=high`，確認結束碼為 0
- [x] 2.2 新增 `.github/dependabot.yml`（npm 每週、minor／patch 合併成一組、`open-pull-requests-limit: 5`；github-actions 每週、全部合併成一組），用 `ruby -ryaml -e 'p YAML.load_file(".github/dependabot.yml")["updates"].size'` 確認能解析且輸出 2；實際生效在 5.2 確認

## 3. CodeQL

- [x] 3.1 新增 `.github/workflows/codeql.yml`（push 到 `main`、`pull_request`、每週 `schedule`；語言 `javascript-typescript`、`actions`，`build-mode: none`；權限 `security-events: write`、`contents: read`、`actions: read`），用 `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7` 檢查 `ci.yml` 與 `codeql.yml` 都沒有錯誤

## 4. 文件

- [x] 4.1 更新 `docs/development.md`「CI（GitHub Actions）」：表格加入格式檢查與 `security` job，新增 CodeQL 與 Dependabot 的說明（在哪裡看結果、Dependabot PR 怎麼處理、audit 失敗時怎麼做）
- [x] 4.2 更新 `README.md` 技術表的 CI 一列，以及 `.claude/skills/check-placement/SKILL.md` 分工表的「格式」「Security Scan」兩列，改成已在 CI 執行；用 `grep -n '尚未加入\|還沒加' README.md docs/development.md .claude/skills/check-placement/SKILL.md` 確認沒有過時的說法

## 5. 整合驗證

- [x] 5.1 本機依序執行 `npm run lint`、`npm run format:check`、`npm run build`、`npm test`、`npm audit --audit-level=high`，全部通過
- [ ] 5.2 經使用者同意 commit 並 push 到 `main` 後，用 `gh run list` 確認 CI（三個 job）與 CodeQL 都成功，GitHub 的 Security 分頁出現 CodeQL 的掃描結果，且 Insights → Dependency graph → Dependabot 頁面沒有設定錯誤
- [ ] 5.3 經使用者同意後，開啟 Dependabot alerts 與 security updates（GitHub 設定頁面，或 `gh api -X PUT repos/zooroy/who-pays/vulnerability-alerts` 與 `.../automated-security-fixes`），用 `gh api repos/zooroy/who-pays/automated-security-fixes` 確認已開啟

## Workflow follow-up

- 審查通過後 archive 這個 change（`skip_specs: true`，不需同步主規格）。
- 第一週後確認 Dependabot 有依設定開 PR，且 PR 的 CI 能正常執行。
