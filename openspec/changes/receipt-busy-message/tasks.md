# Tasks

## 1. Edge Function 回傳 MODEL_BUSY

- [x] 1.1 在 `supabase/functions/parse-receipt/receipt.ts` 新增錯誤碼 `MODEL_BUSY`（`ERROR_STATUS` 為 503），`upstreamError(503)` 改回 `MODEL_BUSY`，並新增 `timeoutError(lastStatus)`（design 第 1、2 節）；更新 `receipt.test.ts`：503 → `MODEL_BUSY`，500、400 → `UPSTREAM_ERROR`，429、402 → `QUOTA_EXCEEDED`；`timeoutError(503)` → `MODEL_BUSY`，`timeoutError(500)`、`timeoutError(null)` → `TIMEOUT`。驗證：`npm test` 通過
- [x] 1.2 `supabase/functions/parse-receipt/index.ts` 在重試迴圈中記下最後一次的 HTTP status，逾時時改用 `timeoutError` 決定錯誤碼。驗證：本機沒有 deno，用 `supabase functions serve parse-receipt` 在本機啟動不報錯，並以未登入的請求呼叫得到 `UNAUTHORIZED`，確認 Function 可以載入執行

## 2. 前端顯示專屬訊息

- [x] 2.1 `src/features/receipt/model.ts` 的 `ScanFailure` 加入 `MODEL_BUSY`，`scanFailureMessage` 回傳「自動辨識現在太忙，請稍後再試或手動輸入。」；`src/features/receipt/api.ts` 的 `KNOWN` 加入 `MODEL_BUSY`；在 `model.test.ts` 加上 `scanFailureMessage` 的測試（`MODEL_BUSY`、`TIMEOUT`、`UPSTREAM_ERROR` 各一）。驗證：`npm test` 通過

## 3. 整體驗證

- [x] 3.1 執行 `npm test`、`npm run lint`、`npm run build`，三者皆通過

## Workflow follow-up

- 先執行 `supabase functions deploy parse-receipt --use-api`，再執行 `npm run deploy`（design「Migration Plan」）。
- 部署後拍一張收據，確認一般情況仍能正常辨識。「太忙」的訊息要等 Gemini 下次回 503 時才看得到。
- 審查通過後 archive 這個 change，把 delta 合併進 `openspec/specs/receipt-scanning/spec.md`。
