# Tasks

## 1. 分享連結帶外部瀏覽器參數

- [x] 1.1 在 `src/features/trip/shareLink.ts` 新增 `shareUrl(origin, shareToken)`（design 第 1 節），在 `shareLink.test.ts` 加上測試：正式與本機 origin 都產生 `<origin>/t/<token>?openExternalBrowser=1`，origin 結尾有無斜線結果相同。驗證：`npm test` 通過
- [x] 1.2 `src/features/trip/TripPage.tsx` 的 `copyLink` 改用 `shareUrl(window.location.origin, trip.share_token)`。驗證：`npm run dev` 後在旅程頁按「複製旅程連結」，以及在旅程設定重設後按「複製新連結」，貼上的網址都帶 `?openExternalBrowser=1`，在無痕視窗開啟該網址能正常進入加入流程（spec「複製分享連結」「在瀏覽器直接開啟分享連結」）

## 2. 移除「用旅程連結開啟」

- [x] 2.1 從 `src/features/trip/MyTrips.tsx` 移除 `OpenTripLink` 及其在兩種朋友首頁的使用，並清掉不再用到的 import（`useState`/`FormEvent` 若無其他使用、`LinkIcon`、`TextField`、`parseShareToken`）；從 `shareLink.ts` 與 `shareLink.test.ts` 刪除 `parseShareToken` 與其測試；從 `src/features/trip/trip.css` 移除 `.my-trips__open`、`.my-trips__form` 相關樣式。驗證：`grep -rn "parseShareToken\|OpenTripLink\|my-trips__open\|my-trips__form\|用旅程連結開啟" src` 沒有結果
- [x] 2.2 在瀏覽器確認首頁三種狀態（spec「第一次使用」「列出已參加的旅程」「擁有者的首頁」）：無痕視窗的訪客只看到說明與「擁有者登入」；用分享連結加入後回首頁只看到旅程列表與「擁有者登入」；擁有者登入後看到全部旅程與「建立新旅程」

## 3. 整體驗證

- [x] 3.1 執行 `npm test`、`npm run lint`、`npm run build`，三者皆通過
- [x] 3.2 確認不帶參數的舊連結 `/t/<token>` 仍能正常開啟（spec「不帶參數的舊連結」）

## Workflow follow-up

- 部署（`npm run deploy`）後，由擁有者在 iPhone 的 LINE 聊天室點一次複製出來的分享連結，確認改用 Safari 開啟（spec「從 LINE 開啟分享連結」）。
- 審查通過後 archive 這個 change，把 delta 合併進 `openspec/specs/trip-membership/spec.md`。
