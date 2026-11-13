# Design

## Context

- `vite.config.ts` 用 `VitePWA({ registerType: 'autoUpdate' })`，由外掛產生的 `registerSW.js` 在 `load` 時註冊 `/sw.js`。新的 service worker 會自動接手，但已經開著的頁面仍在執行舊的 JS，要等下一次載入才是新版。
- iOS 上的主畫面 App 常常是從背景切回，而不是重新載入，所以舊版會留得更久。
- 有「進行中狀態」的畫面：新增或編輯支出（`/t/:token/expenses/new`、`…/edit`）、拍收據的等待畫面（`[role="dialog"]`）、成員面板中的表單、建立旅程（`/new`、或擁有者沒有旅程時首頁的建立表單）、登入頁，以及結算頁中記錄還款的表單。
- `vite-plugin-pwa` 2.x 提供 `virtual:pwa-register` 的 `registerSW({ onNeedRefresh, onRegisteredSW })`，傳回 `updateSW(reloadPage)`。

## Goals / Non-Goals

**Goals:**
- 部署後，使用者下一次停在安全的畫面時就換成新版。
- 絕不在填寫或等待中途重新載入。

**Non-Goals:**
- 不顯示「有新版本」的提示或按鈕。
- 不在 App 中顯示版本號。
- 不改變快取策略、離線行為或 Supabase 的資料流。

## Decisions

### 1. 改成 `registerType: 'prompt'`，由 App 決定何時啟用新版

`vite.config.ts` 改為 `registerType: 'prompt'`、`injectRegister: false`，在 `src/lib/appUpdate.ts` 用 `registerSW` 自行註冊。新的 service worker 下載完後會停在 waiting，觸發 `onNeedRefresh`。App 記下「有待套用的更新」，在安全的時機呼叫 `updateSW(true)`，讓它接手並重新載入頁面。

- **為什麼不留在 `autoUpdate`**：`autoUpdate` 下新的 service worker 會立刻接手，App 無法決定重新載入的時機；若在 `controllerchange` 時自己重新載入，就會打斷填寫中的表單。
- **替代方案**：顯示「有新版本，點這裡更新」的提示。不採用，因為使用者要求自動更新，而且旅行中的朋友不一定會注意提示。

### 2. 安全時機的判斷

新增純函式 `isSafeToReload({ pathname, hasForm, hasDialog, isBusy }): boolean`：

- `pathname` 必須是下列之一：`/`、`/t/:token`、`/t/:token/settle`、`/t/:token/expenses/:id`（不含 `/new`、`/edit`）。
- 而且 `hasForm`、`hasDialog`、`isBusy` 都是 `false`。

呼叫端從 `location.pathname`、`document.querySelector('main form')`、`document.querySelector('[role="dialog"]')`、`document.querySelector('[aria-busy="true"]')` 取得這四個值。`isBusy` 是實作時補上的：結算頁沒有 `<form>`，但「標記已付」「刪除還款」送出時按鈕會帶 `aria-busy`，這時重新載入會讓使用者看不到結果。

- **為什麼路徑加上 DOM 檢查**：路徑能排除整頁的表單，DOM 檢查能涵蓋同一個路徑裡打開的成員表單、還款表單、首頁的建立旅程表單，以及收據等待畫面，不必讓每個元件回報自己的狀態。
- **替代方案**：讓各個表單元件登記「有未儲存內容」。比較精確，但要改很多元件，這次不採用。

### 3. 何時嘗試套用

- **收到 `onNeedRefresh` 時**：立刻嘗試一次。
- **路由改變時**：`App.tsx` 用 `useLocation` 監聽，每次路由改變後（等畫面渲染完）嘗試一次，讓「存完支出回到列表」時能更新。
- **回到前景時**（`visibilitychange` 變成 `visible`）：先呼叫 `registration.update()` 檢查新版，再嘗試套用。
- **每 30 分鐘**：呼叫 `registration.update()`。

從相機或相簿回到 App 時會觸發 `visibilitychange`，但這時畫面在「拍收據」流程中（路徑是 `/t/:token/expenses/new`），不算安全時機，所以不會重新載入。

### 4. 重新載入後的狀態

重新載入會保留網址，所以使用者仍停在同一頁。登入狀態與匿名身份存在 localStorage，不受影響；資料由 React Query 重新抓取。

## Risks / Trade-offs

- [DOM 檢查漏掉某種進行中的狀態] → 目前會遺失內容的狀態都是 `<form>` 或等待畫面；之後新增的進行中畫面也應該使用 `<form>`。
- [使用者一直停在不安全的畫面] → 更新會延後，但不會遺失；下次回到列表或重新打開時就會套用。
- [這個 change 本身的上線] → 手機上的舊版沒有這段程式，第一次仍要依舊機制打開兩次；之後的部署才會自動更新。
- [開發環境] → `vite dev` 不啟用 service worker，驗證要用 `npm run build` 加 `vite preview`。

## Migration Plan

1. `npm run deploy`。
2. 在手機上依舊機制打開兩次，拿到這個版本。
3. 之後再部署一個小改動，確認停在支出列表時會自動換成新版。

回滾時重新部署前一版即可。
