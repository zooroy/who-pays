# Design

## Context

- `AppShell` 的 `back?: { to; label }` 只畫一個 `BackIcon` 連結，`label` 只用在 `aria-label`。標題 `h1` 與返回在同一行，右側是 `headerExtra`（旅程頁的成員頭像列）。
- 成員相關的面板是 `TripPage` 的 `panel` 狀態（`'members' | 'switch' | 'settings' | 'add' | { edit }`），開啟時取代支出列表的內容，但沒有自己的網址；面板內各有 `h2` 標題與「關閉」「取消」「返回成員」按鈕。
- `TripPage` 在所有子頁面都傳 `back={HOME}`（`/`），標題固定是旅程名稱；子頁面內容自己有 `h2`：`ExpenseDetail` 是支出名稱，`ExpenseForm` 是「新增支出」「確認收據內容」「編輯支出」，`ReceiptScan` 是「拍收據」。
- `CreateTrip`、`LoginPage` 也傳 `{ to: '/', label: '回到我的旅程' }`。
- 刪除旅程目前在 `TripPage` 的 `TripSettings`，呼叫 `deleteTrip(tripId)`（先刪 Storage 的收據照片，再呼叫 `delete_trip` RPC）。
- `TripTicket` 是可點的 `Ticket`（整張票卡是 `<button>`）。`Ticket` 支援 `stub`，但 `<button>` 裡不能再放按鈕。
- 拍收據的確認畫面是 `ReceiptScan` 傳 `receipt` 與 `onCancel`（刪除照片）給 `ExpenseForm`；按「取消」會呼叫 `onCancel`，但用其他方式離開時不會，照片會留在 Storage。

## Goals / Non-Goals

**Goals:**
- 返回的目的地一看就懂，行為和 iOS 的「回上一層」一致。
- 擁有者在列表層級就能刪除旅程，而且不容易誤刪。

**Non-Goals:**
- 不使用 `history.back()`，也不追蹤使用者實際的瀏覽路徑。
- 不把面板改成獨立的路由；iPhone 的邊緣滑動返回因此不會關閉面板，仍是瀏覽器的上一頁。
- 不移除面板內原本的「關閉」「取消」「返回成員」按鈕。
- 不做滑動刪除，也不做多選刪除。
- 不改資料庫或 `deleteTrip` 的刪除順序。

## Decisions

### 1. 返回改成標題上方的一行文字，可以是連結或按鈕

`AppShell` 的 `back` 改為 `{ label; to } | { label; onClick }`：有 `to` 時是連結，有 `onClick` 時是按鈕（用於沒有網址的面板）。兩者外觀相同，顯示「‹ <label>」（`BackIcon` 加上文字），放在標題上方獨立一行；`label` 直接是目的地名稱（例如「我的旅程」「台南之旅」「支出明細」「成員」），`aria-label` 為「回到<label>」。觸控區域維持至少 `--touch-min` 高。

新增選填的 `titleHidden?: boolean`：為 true 時 `h1` 加上 `visually-hidden`，供子頁面與面板使用，因為它們的內容已有自己的 `h2` 標題，畫面上就是「‹ 台南之旅」下方接著「晚餐（一蘭拉麵）」或「成員（3 人）」。螢幕閱讀器仍讀得到 `h1`。

```
支出列表                      支出明細
┌────────────────────────┐   ┌────────────────────────┐
│ ‹ 我的旅程      (頭像) │   │ ‹ 台南之旅      (頭像) │
│ 台南之旅               │   │ 晚餐（一蘭拉麵）  ← h2 │
│ ...                    │   │ ...                    │
```

- **替代方案**：返回文字與標題放同一行。不採用，因為窄螢幕上「‹ 我的旅程」＋旅程名稱＋右側頭像會擠在一起被截斷。

### 2. 返回目的地用純函式決定

新增 `src/features/trip/backTarget.ts` 的 `backTarget(pathname, tripName, panel)`，回傳 `{ to, label, titleHidden }` 或面板用的 `{ panel, label, titleHidden }`（`panel` 為按下返回後要切換到的面板，`null` 表示關閉面板）。面板優先於路徑判斷：

| 開啟中的面板 | panel（按下後） | label | titleHidden |
|---|---|---|---|
| `'members'` | `null`（關閉） | 旅程名稱 | true |
| `'switch'`、`'settings'`、`'add'`、`{ edit }` | `'members'` | 成員 | true |

沒有面板時依路徑：

| pathname | to | label | titleHidden |
|---|---|---|---|
| `/t/:token`、`/t/:token/settle` | `/` | 我的旅程 | false |
| `/t/:token/expenses/new`（含 `?source=camera`） | `/t/:token` | 旅程名稱 | true |
| `/t/:token/expenses/:id` | `/t/:token` | 旅程名稱 | true |
| `/t/:token/expenses/:id/edit` | `/t/:token/expenses/:id` | 支出明細 | true |

`TripPage` 主畫面用它取代 `back={HOME}`：回傳 `to` 時傳連結，回傳 `panel` 時傳 `onClick: () => setPanel(panel)`。找不到旅程、載入中與錯誤畫面維持 `{ to: '/', label: '我的旅程' }`。`CreateTrip`、`LoginPage` 的 label 改為「我的旅程」。

- **為什麼是純函式**：目的地對照是規格裡的行為，抽出來才能直接用 Vitest 測每一種路徑。

### 3. 附照片的新增支出被返回離開時刪除照片

`ExpenseForm` 在有 `receipt` 且是新增支出時，記錄是否已儲存或已按「取消」。元件卸載時若兩者都沒有，就呼叫 `onCancel`（刪除照片）。卸載的判斷延到下一個 tick，避免 React StrictMode 開發時的假卸載誤刪照片（與 `ReceiptScan` 的離開清理相同做法）。

- **為什麼這次要做**：返回變得顯眼後，從確認收據畫面按返回離開會變常見；不處理就會在 Storage 留下沒有支出的照片。
- **替代方案**：讓返回連結在這個畫面改成呼叫 `onCancel` 的按鈕。不採用，因為 iOS 的邊緣滑動返回同樣會離開，卸載清理能一併涵蓋。

### 4. 「我的旅程」的編輯模式

只有 `isOwner` 且至少有一個旅程時，`MyTrips` 透過 `AppShell` 的 `headerExtra` 顯示 quiet 按鈕「編輯」；編輯模式中變成「完成」。

| 狀態 | 每張旅程票卡 |
|---|---|
| 一般 | 可點的 `TripTicket`，進入旅程（不變） |
| 編輯模式 | 不可點的 `Ticket`，`stub` 放 quiet 按鈕「刪除<span class="visually-hidden">旅程名稱</span>」 |
| 確認刪除該旅程 | `stub` 改為說明文字「會一起刪除<旅程名稱>的所有支出、還款、成員與收據照片，無法復原。」與按鈕「刪除<旅程名稱>」（primary，`busy` 期間停用）、「取消」（secondary） |

- 同一時間只會有一張票卡在確認狀態；在另一張按「刪除」時，前一張回到編輯狀態。
- 刪除成功後 `removeQueries(tripKey(id))`，並 invalidate `['my-trips']`，維持在編輯模式；全部刪完時依既有邏輯顯示建立旅程的畫面。
- 刪除失敗時在該票卡上顯示錯誤（沿用 `TripSettings` 的訊息：`OWNER_REQUIRED` 用 `membershipError`，其他為「無法刪除旅程，請確認網路連線後再試一次。」）。
- 確認按鈕不用朱肉紅，紅色只保留給「已付」印章；後果靠文字說明。
- **替代方案**：滑動刪除。不採用，因為不易發現，也會和 iOS Safari 的邊緣滑動手勢衝突。

### 5. 旅程設定移除刪除旅程

`TripSettings` 移除 `confirm === 'delete'` 分支、「刪除旅程」按鈕、`remove()` 與 `deleteTrip` 的 import，只保留重設分享連結。`deleteTrip` 改由 `MyTrips` 使用。

## Risks / Trade-offs

- [編輯模式裡誤按刪除] → 需要兩步：先按「刪除」，再按寫著旅程名稱的確認按鈕，並在按鈕旁說明後果。
- [卸載時刪除照片在 App 被關閉時來不及送出] → 與既有的離開清理相同，可能留下少量照片，影響很小。
- [子頁面的 `h1` 被視覺隱藏] → 螢幕閱讀器仍有 `h1`（旅程名稱）與內容的 `h2`，閱讀順序合理。
- [面板開啟時用 iPhone 邊緣滑動返回，會照瀏覽器的上一頁離開，而不是關閉面板] → 左上角返回與面板內的按鈕都能正確回上一層；要讓滑動也一致需把面板改成路由，留待之後評估。

## Migration Plan

只有前端改動：`npm run deploy`。手機會在下一次停在安全頁面時自動更新（app-updates）。回滾就重新部署前一版。
