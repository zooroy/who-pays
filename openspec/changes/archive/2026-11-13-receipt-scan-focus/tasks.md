# Tasks

## 1. 等待文字

- [x] 1.1 在 `src/features/receipt/model.ts` 新增 `SLOW_SCAN_MS` 與 `scanWaitText(step, elapsedMs)`（design 第 4 節），在 `src/features/receipt/model.test.ts` 測試三種結果：上傳中 →「正在上傳照片…」無說明；辨識 0 與 14,999ms →「辨識中…」+「通常要 10 到 30 秒」；辨識 15,000ms →「辨識中…」+「比平常久一點，可以繼續等，或改成手動新增」。驗證：`npm test` 通過

## 2. 整頁等待畫面

- [x] 2.1 `ReceiptScan.tsx` 的 `working` 階段改用 portal 渲染整頁等待畫面（design 第 1、2 節）：旅程名稱標題、`Ticket` 中的照片、`role="status"` 的主文字與說明、底部 secondary 按鈕「改成手動新增」；`role="dialog"`、`aria-modal`、`aria-labelledby`；進入時把 `#root` 設為 `inert`、焦點移到按鈕，離開時移除 `inert`；辨識中每秒依 `scanWaitText` 更新文字。驗證：`npm run dev` 拍收據，等待畫面蓋住返回鍵、成員頭像與分頁，點那些位置沒有反應；用 Tab 鍵只能移到「改成手動新增」（spec「上傳中」「辨識中」「誤觸畫面其他位置」）
- [x] 2.2 在 `receipt.css` 加上整頁版面與剪票虛線掃描動畫（design 第 2、3 節），只使用 `tokens.css` 既有的變數；`prefers-reduced-motion: reduce` 時 `animation: none`。驗證：瀏覽器以 iPhone 寬度（390px）檢查照片、文字與按鈕同時可見；在 DevTools 模擬減少動態效果，虛線停在照片頂端
- [x] 2.3 驗證超過 15 秒的文字：在本機讓辨識變慢（例如 DevTools 對 `parse-receipt` 設定網路節流，或暫時拉長本機 Function 的回應），確認 15 秒後說明改為「比平常久一點，可以繼續等，或改成手動新增」（spec「辨識比平常久」）

## 3. 出口與清理

- [x] 3.1 在 `ReceiptScan.tsx` 實作「改成手動新增」（design 第 5 節）：辨識中按下立即開啟附照片、未預填的手動新增畫面，之後的辨識結果被忽略；上傳中按下則等上傳完成後開啟、不送出辨識。驗證：瀏覽器分別在兩個階段按下，確認畫面與欄位，並在 Network 面板確認上傳中按下時沒有 `parse-receipt` 請求（spec「辨識中改成手動新增」「上傳中改成手動新增」）
- [x] 3.2 實作離開時清理：卸載時仍在 `working` 階段，就刪除已上傳的照片（或在上傳完成後刪除）、不送出辨識並忽略結果，並確保 `#root` 的 `inert` 被移除。驗證：辨識中用瀏覽器上一頁離開，旅程頁可以正常操作，用 `supabase db query` 查本機 `storage.objects` 確認那張照片已刪除（spec「辨識中用返回手勢離開」「上傳中離開」）

## 4. 整體驗證

- [x] 4.1 執行 `npm test`、`npm run lint`、`npm run build`，三者皆通過
- [x] 4.2 走一次正常流程：拍收據 → 等待畫面 → 辨識成功進入確認畫面 → 儲存支出，確認確認畫面與支出明細的照片都正常，`#root` 沒有殘留 `inert`

## Workflow follow-up

- `npm run deploy` 後，在 iPhone 實際拍一張收據，試著在辨識中點畫面各處、按「改成手動新增」、用返回手勢離開。
- 審查通過後 archive 這個 change，把 delta 合併進 `openspec/specs/receipt-scanning/spec.md`。
