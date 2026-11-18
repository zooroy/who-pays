# Design

## Context

- 身份目前存在資料庫的 `trip_access.member_id`，匿名朋友和擁有者都一樣（見 `2026-11-06-owner-account/design.md`）。
- 更早的版本把身份存在 localStorage 的 `whopays:trip:<tripId>:member`。為了轉換，`migrateLocalIdentities()`（`src/features/trip/api.ts`）會在兩個時機把這些 key 搬進資料庫：
  - App 啟動時，由 `src/App.tsx` 呼叫。
  - 擁有者登入後，由 `src/features/account/account.ts` 呼叫。
- `src/lib/identity.ts` 有三個相關函式：
  - `parseIdentityKey`、`readLocalIdentities`：只給上面的搬遷使用。
  - `pendingMigrations`：除了搬遷，登入時「沿用匿名身份」（`account.ts` 的 `carried`）也會用到。
- 正式環境的旅程與匿名使用者已經全部清空，舊 key 指向的旅程都不存在了。
- Scenario 對照報告用「Requirement › Scenario」比對 E2E 標題與 `@scenario` 標註。`owner_account.test.sql` 標註了「擁有者存取全部旅程」底下的兩個 Scenario。

## Goals / Non-Goals

**Goals:**

- 主規格只描述現在仍然成立、而且之後也會成立的行為。
- 刪掉只為了轉換而存在的程式碼，但不影響其他流程。

**Non-Goals:**

- 不重新審查已經有自動測試的 69 條 Scenario：測試通過就代表行為仍然符合。

## Decisions

### 1. 盡量只改 Scenario 內容，不改名稱

除了下面第 2 點的例外，其他 Scenario 和 Requirement 名稱都不變，只改 WHEN／THEN 的文字。這樣 E2E 標題和 `@scenario` 標註都不必跟著改，Scenario 對照報告的歷史也能接續。

### 2. 刪除單一 Scenario：REMOVED 後以新名稱 ADDED

OpenSpec 2.1 的 `validate` 不允許 MODIFIED 少掉現有的 Scenario（archive 也會拒絕），也不允許同一個 Requirement 同時出現在 REMOVED 與 ADDED。所以「擁有者存取全部旅程」的處理方式是：

- REMOVED「擁有者存取全部旅程」，寫明原因與遷移方式。
- ADDED「擁有者跨裝置存取所有旅程」，描述與「換裝置看到同一份資料」Scenario 完全沿用。

連帶的影響是識別鍵從「擁有者存取全部旅程 › 換裝置看到同一份資料」變成「擁有者跨裝置存取所有旅程 › 換裝置看到同一份資料」，`owner_account.test.sql` 的標註要跟著改。

替代方案：直接手動修改主規格。缺點是繞過 change 的紀錄，archive 也看不出這次刪了什麼。

### 3. 移除舊版 localStorage 搬遷

- 刪除 `migrateLocalIdentities()` 與它在 `App.tsx`、`account.ts` 的呼叫。
- 刪除 `parseIdentityKey`、`readLocalIdentities` 與它們的測試。
- 保留 `pendingMigrations` 與它的測試：登入時沿用匿名身份仍然需要它。原本測試標註的 `@scenario 記住身份 › 第一次登入沿用身份` 也保留。

不清除使用者瀏覽器裡殘留的舊 key：它們不會再被讀取，也不會造成錯誤；為了清除它們而多寫程式不值得。

替代方案：保留搬遷程式，以防還有人用舊版。缺點是搬遷的目標旅程已經不存在，留著只會讓每次啟動多一次無用的檢查。

### 4. 「找不到這趟旅程」只寫共同的部分

畫面上會依情況顯示「找不到這趟旅程。連結可能打錯了。」或「找不到這趟旅程，可能已被擁有者刪除。」。規格只寫兩者共同的「找不到這趟旅程」，後面的說明文字之後可以調整，不必連規格一起改。

## Risks / Trade-offs

- [某位朋友的瀏覽器仍存著舊版身份，而且那趟旅程還存在] → 正式環境的資料已經全部清空，這種情況不存在；就算發生，朋友也只需要重新選一次身份。
- [規格修改後忘了更新標註] → `npm run scenarios:check` 會擋下指向不存在 Scenario 的標註。
