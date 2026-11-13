# Tasks

## 1. 返回目的地與顯示

- [x] 1.1 新增 `src/features/trip/backTarget.ts` 的 `backTarget(pathname, tripName, panel)`（design 第 2 節），並在 `backTarget.test.ts` 測試表格中的每一種路徑（支出列表、結算、新增支出、拍收據、支出明細、編輯支出）與每一種面板（成員、切換身份、旅程設定、新增朋友、編輯成員），以及面板優先於路徑。驗證：`npm test` 通過
- [x] 1.2 `AppShell` 的返回改為標題上方一行「‹ <label>」，支援連結（`to`）與按鈕（`onClick`）兩種且外觀一致，`aria-label` 為「回到<label>」，新增 `titleHidden`（design 第 1 節），只使用既有 tokens。驗證：`npm run build` 通過；瀏覽器在 390px 寬檢查支出列表的返回、標題與右側頭像不重疊
- [x] 1.3 `TripPage` 主畫面改用 `backTarget`，其餘狀態與 `CreateTrip`、`LoginPage` 的 label 改為「我的旅程」。驗證：瀏覽器依序檢查支出列表與結算顯示「‹ 我的旅程」、支出明細與新增支出顯示「‹ <旅程名稱>」且標題是內容的 h2、編輯支出顯示「‹ 支出明細」並回到該筆明細；直接用網址開啟支出明細後按返回仍回到支出列表；打開成員面板顯示「‹ <旅程名稱>」與「成員（N 人）」標題，按返回關閉面板；在編輯成員、新增朋友、切換身份、旅程設定顯示「‹ 成員」，按返回回到成員面板（spec「回到上一層」各情境）

## 2. 附照片的新增支出離開時清理

- [x] 2.1 `ExpenseForm` 在有 `receipt` 的新增支出未儲存也未取消就卸載時呼叫 `onCancel`，延到下一個 tick 判斷（design 第 3 節）。驗證：本機拍收據進入確認畫面後按左上角返回，查本機 `storage.objects` 確認照片已刪除；另走一次儲存流程，確認照片保留且支出明細可看到（spec「確認收據內容時返回」）

## 3. 在「我的旅程」刪除旅程

- [x] 3.1 `MyTrips` 加上擁有者的編輯模式、票卡上的刪除與確認（design 第 4 節），使用 `deleteTrip`，樣式放在 `trip.css` 並只用既有 tokens。驗證：瀏覽器以本機擁有者操作：編輯 → 刪除 → 取消（資料不變、仍在編輯模式）；編輯 → 刪除 → 「刪除<旅程名稱>」（旅程從列表消失、本機 `storage.objects` 沒有該旅程的照片）；完成後點票卡可進入旅程；編輯模式中點票卡不會進入旅程；朋友身份的首頁沒有「編輯」（spec「刪除旅程」各情境）
- [x] 3.2 `TripSettings` 移除刪除旅程（design 第 5 節）。驗證：擁有者打開旅程設定只看到重設分享連結；`grep -n "deleteTrip" src/features/trip/TripPage.tsx` 沒有結果（spec「旅程頁面沒有刪除入口」）

## 4. 整體驗證

- [x] 4.1 執行 `npm test`、`npm run lint`、`npm run build`，三者皆通過

## Workflow follow-up

- `npm run deploy` 後在 iPhone 上確認返回文字與目的地，以及「我的旅程」的編輯與刪除。
- 審查通過後 archive 這個 change，把 delta 合併進 `openspec/specs/owner-account/spec.md` 與 `openspec/specs/trip-membership/spec.md`。
