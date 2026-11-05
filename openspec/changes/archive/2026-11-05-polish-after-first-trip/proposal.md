# Proposal

## Why

第一次以三支手機實際旅行測試（MVP 任務 9.3）後，發現幾個會在旅途中卡住使用者的問題：進入一個旅程後就無法離開或建立第二個旅程；用 Safari「加入主畫面」後，主畫面 App 因為儲存空間與 Safari 分開，每次打開都停在建立旅程畫面，找不回既有旅程；成員的名字與頭像建立後無法修改；「切換身份」一按就清掉身份且無法取消。此外網站 icon 需要重新設計成符合「車票與印章」design tokens 的吉祥物。

## What Changes

- 新增「我的旅程」首頁：列出目前這個裝置（匿名身份）可存取的所有旅程，並提供「建立新旅程」。沒有任何旅程時直接顯示建立表單。
- 旅程頁新增回到「我的旅程」的入口。
- 首頁新增「用旅程連結開啟」：可貼上或從剪貼簿讀取分享連結，開啟後沿用既有的加入／認領身份流程。這是主畫面 App 第一次使用時接回旅程的方式。**不做帳號登入**。
- 名字改為選填：建立旅程、加入旅程、新增朋友時若未填名字，以所選頭像的中文名稱作為名字。
- 新增「編輯成員」：旅程中任何成員都能修改任何成員的名字與頭像，頭像仍不可重複。
- 「切換身份」改為先選擇要切換成的成員，確定後才更換，並可取消回到原畫面。
- 以 ip-as-logo 重新製作網站 icon（favicon、PWA icon、Apple touch icon、maskable icon），只使用既有 design token 的顏色。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `trip-membership`：新增「我的旅程」「用連結開啟旅程」「編輯成員」需求；修改「建立旅程」「透過連結加入」「佔位成員」（名字選填）、「記住身份」（切換身份可取消）與「分享連結」（無效連結改為回到我的旅程）。

## Impact

- 前端：`src/App.tsx` 路由、`src/features/trip/`（新增首頁、`CreateTrip.tsx`、`MemberForm.tsx`、`TripPage.tsx` 的成員面板與切換身份流程）、`src/components/AppShell`（回首頁入口）。
- 資料庫：新增 migration，提供修改成員的 RPC（需旅程存取權、頭像唯一），以及對應的 pgTAP 測試；正式環境需 `supabase db push`。
- 靜態資源：`public/` 的 icon 檔案與 `index.html`、`vite.config.ts` 的 manifest icon 設定；icon 圖片由 Codex 以 ip-as-logo 產生（Claude 無法產生圖片）。
- 不影響支出、收據辨識與結算的行為。
