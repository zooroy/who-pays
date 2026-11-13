# Tasks

## 1. 安全時機判斷

- [x] 1.1 新增 `src/lib/appUpdate.ts` 的 `isSafeToReload({ pathname, hasForm, hasDialog, isBusy })`（design 第 2 節），並在 `src/lib/appUpdate.test.ts` 測試：`/`、`/t/<token>`、`/t/<token>/settle`、`/t/<token>/expenses/<id>` 在沒有表單與對話框時為 true；`/t/<token>/expenses/new`、`/t/<token>/expenses/<id>/edit`、`/new`、`/login` 為 false；安全路徑但 `hasForm`、`hasDialog` 或 `isBusy` 為 true 時為 false。驗證：`npm test` 通過

## 2. 註冊與套用更新

- [x] 2.1 `vite.config.ts` 改為 `registerType: 'prompt'`、`injectRegister: false`；在 `appUpdate.ts` 用 `virtual:pwa-register` 註冊，`onNeedRefresh` 時記下待更新並嘗試套用；回到前景時呼叫 `registration.update()` 再嘗試套用；每 30 分鐘呼叫 `registration.update()`（design 第 1、3 節）。補上 `vite-plugin-pwa/client` 的型別。驗證：`npm run build` 成功，`dist/index.html` 不再引用 `registerSW.js`
- [x] 2.2 `src/App.tsx` 在 App 啟動時呼叫註冊，並在路由改變後嘗試套用待更新的版本。驗證：`npm run build` 與 `npm run lint` 通過

## 3. 驗證

- [x] 3.1 用 `npm run build` 加 `npx vite preview` 驗證：在瀏覽器停在支出列表，改一行顯示文字後重新 build，切換分頁回來（觸發檢查），頁面自動重新載入並顯示新文字，且仍是同一個身份（spec「在支出列表時更新」「從背景切回」）
- [x] 3.2 同樣方式，在新增支出畫面填了一半時重新 build 並切回，確認頁面沒有重新載入、內容保留；儲存後回到列表，確認此時自動換成新版（spec「填寫支出時不打斷」「存完支出後更新」）
- [x] 3.3 執行 `npm test`、`npm run lint`、`npm run build`，三者皆通過

## Workflow follow-up

- `npm run deploy` 後，手機依舊機制打開兩次拿到這個版本；之後部署一個小改動，確認停在支出列表時會自動更新。
- 審查通過後 archive 這個 change，建立 `openspec/specs/app-updates/spec.md`。
