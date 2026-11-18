# Tasks

## 1. 測試對應

- [x] 1.1 修改 `supabase/tests/owner_account.test.sql` 開頭的標註：刪除 `擁有者存取全部旅程 › 登入前已存在的旅程`，`擁有者存取全部旅程 › 換裝置看到同一份資料` 改成 `擁有者跨裝置存取所有旅程 › 換裝置看到同一份資料`；確認 `grep -rn '擁有者存取全部旅程' e2e src supabase` 沒有結果

## 2. 移除舊版身份搬遷

- [x] 2.1 刪除 `src/features/trip/api.ts` 的 `migrateLocalIdentities()`，以及 `src/App.tsx`、`src/features/account/account.ts` 對它的呼叫；`account.ts` 註解中的「Roy」改成「熊」
- [x] 2.2 刪除 `src/lib/identity.ts` 的 `parseIdentityKey`、`readLocalIdentities`，以及 `src/lib/identity.test.ts` 中只測這兩個函式的測試；保留 `pendingMigrations` 與它的測試和 `@scenario` 標註（該測試目前用 `readLocalIdentities` 準備輸入，改成直接寫出輸入陣列，斷言不變）；用 `grep -rn 'readLocalIdentities\|parseIdentityKey\|migrateLocalIdentities' src` 確認沒有殘留，`npm run lint`、`npm run build`、`npm test` 通過
- [x] 2.3 跑 `npm run test:e2e`（需要 `supabase start`），確認擁有者登入與朋友加入的流程不受影響

## 3. 整合驗證

- [x] 3.1 先把 delta 同步到主規格（`scenarios:check` 讀主規格，標註與規格要在同一個 commit 更新）；`openspec validate tidy-specs --strict` 與 `openspec validate --specs --strict` 通過；本機依序執行 `npm run format:check`、`npm run scenarios:check`、`supabase test db`，全部通過，並跑 `npm run scenarios`，確認 Scenario 總數為 115、已覆蓋數為 68
- [ ] 3.2 經使用者同意 commit 並 push 後，確認 CI 中「相依套件安全檢查」以外的 job 都通過

## Workflow follow-up

- 主規格已在 3.1 同步，archive 時選擇不再同步，只搬移資料夾。
