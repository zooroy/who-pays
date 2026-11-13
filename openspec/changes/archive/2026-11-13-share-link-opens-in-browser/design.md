# Design

## Context

- 分享網址目前在 `TripPage.tsx` 的 `copyLink` 用 `new URL(path, window.location.origin).href` 組成，旅程頁的「複製旅程連結」（兩處）和旅程設定中重設後的「複製新連結」都呼叫它。
- 首頁的 `OpenTripLink`（`MyTrips.tsx`）是 `src/features/trip/shareLink.ts` 中 `parseShareToken` 唯一的使用者。
- LINE 官方支援在網址加上 `openExternalBrowser=1`，點開時改用裝置的預設外部瀏覽器開啟，不經過 LINE 內建瀏覽器。其他 App 與瀏覽器會忽略這個參數。
- 路由 `/t/:shareToken` 只看路徑；`TripPage` 裡跟隨重設後新分享碼的 effect 會保留 `location.search`，所以帶參數開啟不影響現有流程。

## Goals / Non-Goals

**Goals:**
- 所有「複製」出來的分享連結都帶 `openExternalBrowser=1`。
- 移除首頁的貼上連結入口與其專用的程式和樣式，不留死碼。

**Non-Goals:**
- 不處理其他 App（Messenger、Instagram 等）的內建瀏覽器。
- 不在開啟後把網址中的參數清掉。
- 不改 PWA 設定，也不移除「加入主畫面」的能力。
- 不改資料庫、RPC 或 Edge Function。

## Decisions

### 1. 用純函式產生分享網址

在 `shareLink.ts` 新增 `shareUrl(origin: string, shareToken: string): string`，回傳 `${origin}/t/${token}?openExternalBrowser=1`（以 `URL` 與 `searchParams` 組成，避免手動拼字串）。`copyLink` 改為 `shareUrl(window.location.origin, trip.share_token)`。

- **為什麼是純函式**：可以用 Vitest 直接測，不用模擬 `window` 或剪貼簿；本機與正式環境都沿用目前頁面的 origin，行為與現在一致。
- **替代方案**：在 `copyLink` 內直接附加字串。缺點是無法單獨測試，三個複製入口共用的規則也不明顯。

### 2. 直接刪除 `parseShareToken`

移除 `OpenTripLink` 後，`parseShareToken` 與它的測試就沒有使用者了，一起刪除，`shareLink.ts` 只保留 `shareUrl`。`LinkIcon` 在 `MyTrips.tsx` 的 import 一併移除（`src/dev/Preview.tsx` 仍在使用，元件本身保留）。

- **替代方案**：保留 `parseShareToken` 以備日後使用。不採用，因為保留沒有使用者的程式只會增加維護成本，日後需要時可從 git 紀錄找回。

### 3. 沒有旅程的訪客首頁

保留 `Notice`「還沒有旅程。請向朋友索取旅程連結，點開就能加入。」與 `AccountAction`，移除 `<OpenTripLink open />`。有旅程的朋友首頁移除收合的 `<OpenTripLink />`，擁有者的「建立新旅程」不變。

## Risks / Trade-offs

- [LINE 未來不再支援 `openExternalBrowser=1`] → 參數會被忽略，連結仍在內建瀏覽器正常開啟，只是退回目前的行為。
- [已加到主畫面的朋友失去接回旅程的方法] → 目前朋友預設用 Safari，影響很小；他們仍可在瀏覽器中點分享連結使用。擁有者靠登入，不受影響。
- [在 LINE 以外貼上的連結帶著看起來多餘的參數] → 不影響開啟；這是讓 LINE 中的朋友固定用 Safari 的必要代價。
- [無法在桌機或自動化測試中驗證 LINE 的行為] → 實作完成並部署後，由擁有者在 iPhone 的 LINE 聊天室實際點一次連結確認。

## Migration Plan

只有前端改動：`npm run deploy` 即可上線，回滾則重新部署前一個版本。已經分享出去、不帶參數的舊連結繼續有效，不需要重新分享。
