# Design

## Context

- `ReceiptScan.tsx` 依階段（`pick` → `working` → `upload-failed`／`confirm`）切換內容，但它被放在 `TripPage` 的 `AppShell` 裡。標題列的返回鍵、成員頭像按鈕和底部的支出／結算分頁（`.app-shell__bottom`，`position: fixed`、`z-index: 10`）在 `working` 階段都還能點。
- 點了任何一個，`ReceiptScan` 就會被卸載，進行中的 `uploadReceipt`／`parseReceipt` 仍會完成，但它們的 `setStage` 不再有畫面可用；已上傳的照片沒有任何支出參照。
- iOS Safari 的邊緣返回手勢無法攔截；目前用的是 `BrowserRouter`，沒有 `useBlocker` 可用。
- 視覺 tokens 在 `src/styles/tokens.css`；`base.css` 在 `prefers-reduced-motion: reduce` 時會把所有動畫縮短成 1ms、只跑一次。
- React 19 支援 `inert` 屬性；`#root` 是整個 App 的根節點。

## Goals / Non-Goals

**Goals:**
- 上傳和辨識期間，App 裡沒有任何其他可以點的東西。
- 一定有出口，而且出口通往既有的「附照片的手動新增」流程。
- 不論怎麼離開，都不留下沒有支出參照的照片。

**Non-Goals:**
- 不攔截 iOS 的返回手勢，也不加「確定要離開嗎？」的確認框。
- 不讓辨識在背景繼續、回來再看結果。
- 不處理確認畫面或手動新增畫面中途離開時的照片清理；那是既有的行為，不在這次範圍內。
- 不新增共用的 Modal 元件、顏色、字體或動畫時長 token。

## Decisions

### 1. 等待畫面用 portal 蓋在整個 App 上，並把 `#root` 設為 `inert`

`working` 階段時，`ReceiptScan` 用 `createPortal` 把等待畫面渲染到 `document.body`。它是一個 `position: fixed; inset: 0` 的整頁容器，背景是 `--color-ticket-green`，`z-index` 高於 `.app-shell__bottom`。容器設定 `role="dialog"`、`aria-modal="true"`，並用 `aria-labelledby` 指向標題。進入時，把 `#root` 設為 `inert`，離開時移除，讓 Tab 鍵和螢幕閱讀器都碰不到底下的頁面。焦點移到「改成手動新增」按鈕。

- **為什麼用 portal**：等待畫面仍然由 `ReceiptScan` 管理狀態，但視覺上脫離 `AppShell` 的版面，不必修改 `AppShell` 或 `TripPage` 去隱藏標題列和分頁。
- **替代方案**：在 `TripPage` 裡偵測辨識中，再隱藏標題列和分頁。不採用，因為這需要把 `ReceiptScan` 的內部狀態往上傳，牽動的檔案更多。
- **替代方案**：只用 `pointer-events: none` 擋住點擊。不採用，因為鍵盤和螢幕閱讀器仍能操作底下的頁面。

### 2. 版面

```
┌──────────────────────────────┐
│  <旅程名稱>                   │  標題（h2），沒有返回鍵和成員頭像
│   ╭─ Ticket ───────────────╮ │
│   │   ┌────────────────┐   │ │
│   │   │   收據照片     │   │ │
│   │   │ - - - - - - - -│   │ │  剪票虛線往下掃
│   │   └────────────────┘   │ │
│   │        辨識中…         │ │  role="status" aria-live="polite"
│   │   通常要 10 到 30 秒    │ │  --color-ink-soft
│   ╰────────────────────────╯ │
│ ┌──────────────────────────┐ │
│ │      改成手動新增         │ │  Button variant="secondary"，放在拇指位置
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

- 內容寬度沿用 `--content-max`、置中；左右留白 `--space-4`；按鈕固定在底部並加上 `env(safe-area-inset-bottom)`，高度對齊 `--thumb-bar-height`。
- 照片最大高度改成扣掉標題、文字與按鈕後的剩餘空間，避免在小螢幕上把按鈕擠出畫面。

### 3. 掃描線

在照片外包一層 `position: relative` 的容器，用 `::after` 畫一條 `2px dashed var(--color-punch)` 的橫線，以 `transform: translateY` 在照片高度內往下移動，到底後從頂端重新開始，一輪約 2.4 秒。時長直接寫在 `receipt.css`，不新增 token。只要 `prefers-reduced-motion: reduce`，就在 `receipt.css` 明確設定 `animation: none`，讓虛線停在照片頂端，避免 `base.css` 的規則讓它停在任意位置。

### 4. 文字與 15 秒門檻用純函式決定

在 `model.ts` 新增 `scanWaitText(step: 'upload' | 'parse', elapsedMs: number): { label: string; hint: string | null }`，回傳 proposal 裡的三組文字，門檻常數 `SLOW_SCAN_MS = 15_000`。`ReceiptScan` 在辨識開始時記下時間，用一個每秒更新的計時器重新計算；離開 `working` 階段時清掉計時器。

- **為什麼**：文字和門檻是規格裡寫的行為，抽成純函式才能用 Vitest 直接測。

### 5. 「改成手動新增」與離開時清理，用同一個「放棄」旗標

`ReceiptScan` 用一個 ref 記錄這次掃描的狀態：`'scanning' | 'manual' | 'left'`。

| 情況 | 處理 |
|---|---|
| 辨識中按「改成手動新增」 | 旗標設為 `manual`，立即進入 `confirm`，`result: null`、`problem: null`，也就是附照片的手動新增畫面；之後 `parseReceipt` 回來時看到旗標不是 `scanning`，就直接忽略 |
| 上傳中按「改成手動新增」 | 旗標設為 `manual`，按鈕改成忙碌狀態；`uploadReceipt` 完成後不送出辨識，直接進入 `confirm`。上傳失敗時照舊顯示上傳失敗畫面 |
| 元件卸載時仍在 `working` 階段 | 旗標設為 `left`。照片已上傳就立即呼叫 `removeReceipt(path)`；還在上傳的話，等上傳完成後立刻刪除，並且不送出辨識 |

`removeReceipt` 失敗時不重試、不顯示錯誤，因為使用者已經離開這個畫面。

- **替代方案**：用 `AbortController` 中斷辨識請求。不採用，因為中斷不保證 Google 不計費，也不影響使用者看到的行為；忽略結果比較簡單。

## Risks / Trade-offs

- [`inert` 忘了移除，整個 App 都不能點] → 在 effect 的 cleanup 裡移除，並在卸載時也執行；任務中驗證三種離開方式後 `#root` 都不再有 `inert`。
- [刪除照片的請求在使用者關掉 App 時來不及送出] → 會留下少量沒有參照的照片，影響很小；不額外處理。
- [手機橫向或很矮的螢幕上照片太小] → 照片高度用剩餘空間計算，至少保留文字和按鈕可見。
- [減少動態效果時使用者看不到「正在處理」的視覺提示] → 靠「辨識中…」文字與 `role="status"` 傳達，符合規格。

## Migration Plan

只有前端改動：`npm run deploy` 上線，回滾就重新部署前一版。資料庫和 Edge Function 不受影響。
