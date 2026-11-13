# 誰付錢

朋友出國旅行用的多人分帳 PWA：誰付了錢就記下來，拍收據自動辨識，回國前用最少的轉帳一次結清。

**正式網站**：https://who-pays.who-pays.workers.dev
朋友點分享連結就能加入，不需要註冊；只有擁有者能建立旅程。

## 功能

- **免註冊加入**：點旅程連結、選一個吉祥物頭像就能開始記帳。
- **拍收據辨識**：Gemini 讀出店名、金額與品項，並翻成中文；辨識慢或失敗時，自動退回已附上照片的手動輸入。
- **多幣別結算**：依幣別計算每個人的淨額，並給出轉帳次數最少的還款建議。
- **即時同步**：同一趟旅程的成員同時記帳，畫面即時更新。
- **PWA**：可以加到 iPhone 主畫面；部署新版後，會在不打斷操作的時機自動更新。

## 技術

| 層 | 使用 |
|---|---|
| 前端 | React 19、Vite、TypeScript（strict）、TanStack Query、React Router、vite-plugin-pwa |
| 後端 | Supabase：Postgres、Row Level Security、RPC、Realtime、Storage、Edge Functions |
| AI | Gemini（structured output），只在 Edge Function 內呼叫，API 金鑰不會進到瀏覽器 |
| 部署 | Cloudflare Workers 靜態託管、Supabase（東京） |
| 測試 | Vitest（純邏輯）、pgTAP（資料庫權限與 RPC） |

## 設計重點

- **權限在資料庫層**：匿名登入加上 RLS，每個人只讀寫得到自己加入的旅程；旅程、成員與支出的寫入都經過 `security definer` 的 RPC，在同一個 transaction 裡驗證並寫入。
- **金額用整數**：以最小貨幣單位儲存（TWD 元、JPY 円），分攤的餘數分配有固定規則，避免浮點誤差。
- **結算是純函式**：`src/lib/settle.ts` 不存任何狀態，每次都從支出與還款重新計算，並有完整測試。
- **規格驅動開發**：需求寫在 [`openspec/`](openspec/)，每個 Scenario 都可以驗證。每次修改都先開 change（proposal、spec、design、tasks），實作驗證後再 archive 並合併進主規格。開發流程由 Claude Code 與 Codex 協作，分工寫在 [`AGENTS.md`](AGENTS.md)。

## 專案結構

```
src/features/    依功能分：trip、expense、receipt、settlement、account
src/lib/         金額、結算等純邏輯與測試
src/components/  共用元件；樣式 tokens 在 src/styles/
supabase/        migrations、pgTAP 測試、Edge Function（parse-receipt）
openspec/        規格（specs/）與變更紀錄（changes/archive/）
```

## 本機執行

```sh
npm ci
supabase start && supabase db reset
cp .env.example .env.local   # 填入 supabase status -o env 的 ANON_KEY
npm run dev
```

本機需要 Node.js 22.12 以上、Docker（或 OrbStack）與 Supabase CLI。建立旅程需要本機擁有者帳號；擁有者帳號、測試、收據辨識與部署的完整步驟見 [docs/development.md](docs/development.md)。
