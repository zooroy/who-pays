# Proposal

## Why

Gemini 尖峰時會回 503「This model is currently experiencing high demand」。目前這種情況會顯示「自動辨識暫時無法使用」（兩次嘗試都回 503），或「辨識花太久時間了」（第一次回 503、重試時撞到 25 秒上限）。這兩種說法都沒有告訴使用者真正的原因：辨識服務暫時太忙，稍後再試通常就能成功。

## What Changes

- 新增辨識失敗原因「辨識服務太忙」，顯示「自動辨識現在太忙，請稍後再試或手動輸入。」，並和其他失敗一樣開啟附有照片的手動新增畫面。
- 符合下列任一情況時，會顯示這個訊息：
  - 兩次嘗試，Gemini 都回 503。
  - 先收到 503，重試時撞到 25 秒上限。
- 不變的部分：
  - 25 秒上限與「503／500 重試一次」的規則。
  - 純粹逾時（沒有收到任何 503）仍顯示「辨識花太久時間了，請手動輸入。」
  - Gemini 回 500 仍顯示「自動辨識暫時無法使用，請手動輸入。」

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `receipt-scanning`：「辨識失敗退回手動輸入」新增「辨識服務太忙」這個原因與對應的提示。

## Impact

- **Edge Function `parse-receipt`**：
  - `receipt.ts` 新增錯誤碼 `MODEL_BUSY`（HTTP 503），並在 `upstreamError` 把 503 對應到它。
  - `index.ts` 記住是否收到過 503，逾時時據此回傳 `MODEL_BUSY` 或 `TIMEOUT`。
  - 更新 `receipt.test.ts`。
  - 需要重新部署這個 Edge Function。
- **前端**：`src/features/receipt/model.ts` 的 `ScanFailure` 與 `scanFailureMessage`、`api.ts` 的已知錯誤碼清單，加上 Vitest 測試；需要重新部署前端。
- **資料庫**：不變。
- **相容性**：舊前端收到 `MODEL_BUSY` 時，會落到預設訊息「自動辨識暫時無法使用」，不會壞掉。所以先部署 Edge Function、後部署前端也沒問題。
