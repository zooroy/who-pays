# Design

## Context

- `parse-receipt/index.ts` 用一個 25 秒的 `AbortSignal` 包住最多兩次 Gemini 請求。回 500 或 503 時，等 1.5 秒重試一次（`isRetryable`）。
- 逾時（`TimeoutError`／`AbortError`）一律回 `TIMEOUT`；兩次都失敗則用 `upstreamError(status)` 對應錯誤碼，目前 503 會落到 `UPSTREAM_ERROR`。
- 前端 `parseReceipt`（`src/features/receipt/api.ts`）只接受 `KNOWN` 清單裡的錯誤碼，其他一律當成 `UPSTREAM_ERROR`。`scanFailureMessage`（`model.ts`）負責把錯誤碼轉成提示文字。
- 2026-11-13 實測：Gemini 尖峰時同一張收據要 15 到 63 秒才回應，也會回 503。

## Goals / Non-Goals

**Goals:**
- 只要能確定 Gemini 回過 503，就告訴使用者「太忙，稍後再試」。

**Non-Goals:**
- 不改 25 秒上限、重試次數或重試間隔。
- 不把 500 當成忙碌。500 是 Gemini 的內部錯誤，維持「暫時無法使用」。
- 單次請求在 25 秒內都沒有回應時，無法知道 Gemini 是忙碌還是單純很慢，仍視為逾時。
- 不做自動延後重試、排隊或換模型。

## Decisions

### 1. 新錯誤碼 `MODEL_BUSY`，HTTP 503

在 `ReceiptErrorCode` 加上 `MODEL_BUSY`，`ERROR_STATUS.MODEL_BUSY = 503`。`upstreamError(503)` 改回 `MODEL_BUSY`；429、402 維持 `QUOTA_EXCEEDED`，其他（包含 500）維持 `UPSTREAM_ERROR`。

- **替代方案**：沿用 `UPSTREAM_ERROR`，只改前端文字。不採用，因為 500 和 503 的意思不同，前端只拿到錯誤碼，分不出兩者。

### 2. 逾時的判斷交給純函式

在 `receipt.ts` 新增 `timeoutError(lastStatus: number | null): ReceiptErrorCode`：上一次嘗試回 503 就傳回 `MODEL_BUSY`，否則傳回 `TIMEOUT`。`index.ts` 在迴圈中記下最後一次的 HTTP status，逾時時用這個函式決定錯誤碼。

- **為什麼**：這個判斷是這次行為的核心，抽出來才能用 Vitest 測試；`index.ts` 依賴 `Deno.serve`，不方便直接測。
- **替代方案**：用一個 `sawBusy` 布林值。效果相同，但傳 status 讓函式的意思更明確，也方便以後擴充。

### 3. 前端

`ScanFailure` 加上 `MODEL_BUSY`，並加入 `api.ts` 的 `KNOWN` 清單。`scanFailureMessage('MODEL_BUSY')` 回傳「自動辨識現在太忙，請稍後再試或手動輸入。」，之後和其他失敗一樣開啟手動新增畫面。

## Risks / Trade-offs

- [Gemini 在 25 秒後才回 503（實測出現過 28 秒的 503）] → 我們先中斷了請求，看不到 503，仍顯示「花太久時間」。這是可以接受的限制，延長上限才能改善，但這次不改上限。
- [Supabase 閘道本身回 503（例如 Function 啟動失敗）] → 回應內容裡沒有 `code`，前端仍顯示「暫時無法使用」，不會被誤判成 Gemini 忙碌。
- [無法在本機重現 Gemini 503] → 靠單元測試涵蓋 `upstreamError`、`timeoutError`、`scanFailureMessage` 的對應；部署後的實際驗證要等 Gemini 下次忙碌時才能看到。

## Migration Plan

1. 先部署 Edge Function：`supabase functions deploy parse-receipt --use-api`。這時舊前端收到 `MODEL_BUSY` 會顯示「暫時無法使用」，行為和現在相同。
2. 再部署前端：`npm run deploy`。
3. 需要回滾時，重新部署前一版的 Function 和前端；資料庫不受影響。
