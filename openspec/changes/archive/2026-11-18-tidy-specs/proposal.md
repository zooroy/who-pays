# Proposal

## Why

主規格是這個專案的驗收標準，但有幾處已經跟不上現況：

- 有一個為了舊資料寫的轉換期 Scenario。正式環境的資料已經全部清空，它描述的情況不會再發生。
- 有些措辭和畫面對不上。
- 公開 repo 的範例裡出現了開發者的真名。

另外，程式碼裡還留著把舊版 localStorage 身份搬到資料庫的邏輯，搬遷的對象已經不存在了。

這次逐一比對了 Scenario 對照報告中 47 條沒有自動測試的 Scenario，其餘都還符合現在的行為，只有下面列出的需要修改。

## What Changes

- **移除轉換期 Scenario**：刪除 `owner-account`「擁有者存取全部旅程 › 登入前已存在的旅程」。擁有者能存取所有旅程這件事，已經由同一個 Requirement 的「換裝置看到同一份資料」驗證。
  - OpenSpec 不允許在 MODIFIED 中刪除 Scenario，所以改成移除整個 Requirement，再新增「擁有者跨裝置存取所有旅程」，內容相同，只是不含那條 Scenario。
- **改掉範例中的真名**：`trip-membership`「記住身份」的兩個 Scenario 把「Roy」改成「熊」，和其他 Scenario 一樣用頭像名稱。
- **措辭對齊畫面**（行為不變）：
  - 「找不到此旅程」改成畫面上的「找不到這趟旅程」，涉及 `trip-membership`「分享連結 › 無效連結」、`owner-account`「刪除旅程 › 朋友開啟已刪除的旅程」、「重設分享連結 › 用舊連結加入」。
  - `trip-membership`「認領身份 › 認領佔位成員」：畫面是在「我是……」底下列出成員名字，不是「我是企鵝（阿美）」這種按鈕。
  - `trip-membership`「成員列表 › 檢視成員」：旅程頁的頁首只有成員頭像（並標示自己），名字要點開成員面板才看得到。
- **移除舊版身份搬遷程式**：刪除開啟 App 和登入時把舊版 localStorage 身份搬到資料庫的程式碼與測試。
  - 保留「登入時沿用匿名身份」的邏輯，它對應的是「記住身份 › 第一次登入沿用身份」，仍然是現在的流程。

不做的事：

- 不新增測試，也不調整功能或畫面。
- 不處理「辨識結果欄位 › 台灣統一發票」：發票號碼目前只存在辨識結果中，畫面上不顯示。Scenario 描述的是辨識結果本身，仍然成立。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `owner-account`：移除「擁有者存取全部旅程」，新增內容相同但不含轉換期 Scenario 的「擁有者跨裝置存取所有旅程」；「刪除旅程」與「重設分享連結」的措辭對齊畫面。
- `trip-membership`：「分享連結」「認領身份」「記住身份」「成員列表」的措辭對齊畫面，並移除範例中的真名。

## Impact

- 規格：`openspec/specs/owner-account/spec.md`、`openspec/specs/trip-membership/spec.md`（archive 時同步）。
- 程式碼：
  - `src/App.tsx`、`src/features/trip/api.ts`、`src/features/account/account.ts`：移除對 `migrateLocalIdentities` 的呼叫與它本身。
  - `src/lib/identity.ts` 與它的測試：移除 `parseIdentityKey`、`readLocalIdentities`，保留 `pendingMigrations`（登入時沿用身份仍會用到）。
  - `account.ts` 的註解中也有「Roy」，一併改掉。
- `supabase/tests/owner_account.test.sql` 的 `@scenario` 標註要跟著改：刪掉「登入前已存在的旅程」，「換裝置看到同一份資料」改成新的 Requirement 名稱。`npm run scenarios:check` 會擋下漏改的地方。
- 不影響資料庫與正式環境的資料。萬一還有瀏覽器存著舊版的 localStorage key，只是不會再被讀取，不會造成錯誤。
