# Proposal

## Why

朋友預設用 Safari 直接點分享連結加入旅程，不會把 App 加到主畫面，所以首頁的「用旅程連結開啟」（為主畫面 App 接回旅程而設計）幾乎用不到，只是多一個讓人困惑的入口。另一方面，朋友多半是從 LINE 點連結，LINE 預設用自己的內建瀏覽器開啟，它的資料和 Safari 分開，同一個朋友在兩邊會變成兩個匿名使用者，換到 Safari 時要再選一次「我是……」。

## What Changes

- 「複製旅程連結」與重設後的「複製新連結」複製的網址加上 LINE 的 `openExternalBrowser=1` 參數，讓朋友從 LINE 點開時改用外部瀏覽器（iPhone 上是 Safari）開啟。不在 LINE 中開啟時，這個參數沒有作用，連結照常打開旅程。
- 舊的、不帶參數的分享連結仍然有效。
- **BREAKING**：移除首頁的「用旅程連結開啟」（貼上連結或從剪貼簿讀取的欄位）。沒有旅程的訪客首頁只保留「請向朋友索取旅程連結，點開就能加入」的說明與「擁有者登入」。把 App 加到主畫面的朋友，改為從分享連結在瀏覽器中使用。
- 擁有者不受影響：擁有者登入後在任何瀏覽器或主畫面 App 都看得到全部旅程。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `trip-membership`：
  - 「分享連結」：複製的連結會讓 LINE 改用外部瀏覽器開啟。
  - 「我的旅程」：沒有旅程的訪客首頁不再提供「用旅程連結開啟」。
  - 移除「用旅程連結開啟」。

## Impact

- **前端**
  - `src/features/trip/shareLink.ts`：改為產生分享網址的純函式（取代只給貼上欄位使用的 `parseShareToken`），附 Vitest 測試。
  - `src/features/trip/TripPage.tsx`：`copyLink` 改用上述函式。
  - `src/features/trip/MyTrips.tsx`：移除 `OpenTripLink` 與相關 import。
  - `src/features/trip/trip.css`：移除 `.my-trips__open`、`.my-trips__form` 樣式。
- **資料庫、Edge Function**：不變。
- **外部依賴**：依賴 LINE 對 `openExternalBrowser=1` 的支援；LINE 若不支援，連結仍會在內建瀏覽器正常開啟，只是失去改用外部瀏覽器的效果。
