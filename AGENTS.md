# AGENTS.md

給在這個專案工作的 coding agent（Codex 等）閱讀的說明。

## 專案

「誰付錢」：朋友出國旅行時多人共用的分帳 PWA。技術是 React (Vite) + TypeScript + Supabase（Postgres、RLS、Realtime、Storage、Edge Functions）+ Gemini。

## 規格來源（先讀這些再動手）

需求與設計都在 `openspec/` 裡，**以這些文件為準**：

- **目前的系統行為**：`openspec/specs/<capability>/spec.md`，每個 Scenario 都要能驗證。
  - `trip-membership`：建立與加入旅程、頭像、身份、成員的新增、編輯、刪除
  - `owner-account`：擁有者登入，以及只有擁有者能做的操作
  - `expense-tracking`：支出的新增、編輯、刪除
  - `receipt-scanning`：收據拍照與辨識
  - `settlement`：結算與還款
- **進行中的工作**：`openspec/changes/<change-name>/`。被指派任務時，以該 change 為準：
  - `proposal.md`：範圍，以及哪些事不做
  - `specs/*/spec.md`：對上面主規格的修改（ADDED／MODIFIED）
  - `design.md`：這次的設計決策
  - `tasks.md`：任務清單
- **已完成的設計紀錄**：`openspec/changes/archive/`，需要背景時查閱：
  - `2026-11-05-build-who-pays-mvp/design.md`：架構、資料模型、結算演算法、收據 JSON 格式、視覺 tokens
  - `2026-11-05-polish-after-first-trip/design.md`：我的旅程、編輯成員、切換身份、App icon
  - `2026-11-06-owner-account/design.md`：擁有者名單 `app_owners`、身份存在 `trip_access.member_id`、刪除成員與旅程、重設分享連結

## 協作規則

- **角色**：Claude 是 Lead，負責拆任務、審查與整合；Codex 是 Engineer，負責實作被指派的任務。
- **只做被指派的任務**，只改任務說明列出的檔案或目錄。需要動到範圍外的檔案時，停下來並在回報中說明。
- **不要勾選 `tasks.md`**，也不要修改 `openspec/` 底下的任何文件。勾選和規格修改都由 Lead 審查後處理。
- **規格不清楚或互相矛盾時，不要自行決定**：照最保守的解讀實作，並在回報中列出疑問。
- **不要 commit**。Lead 審查通過後會 commit。
- 完成後回報：改了哪些檔案、怎麼驗證的（附指令與結果）、還有哪些疑問或風險。

## 慣例

- TypeScript strict；不使用 `any`，外部資料用型別守衛或明確型別。
- 金額一律是**整數的最小貨幣單位**，使用 `src/lib/money.ts`，不要自己寫格式化或分攤邏輯。
- 結算邏輯在 `src/lib/settle.ts`（純函式，已有測試），UI 直接呼叫它。
- 介面文字是繁體中文，句子用一般的大小寫；按鈕文字要說明會發生什麼事（例如「儲存支出」，不要寫「送出」）。
- UI 必須使用 `src/components/` 的共用元件和 `src/styles/` 的 CSS tokens，不要自己新增顏色或字體。
- 測試：純邏輯用 Vitest（`*.test.ts`，放在原始碼旁邊）；資料庫用 `supabase/tests/*.sql`（pgTAP，以 `supabase test db` 執行）。

## 常用指令

```bash
npm run dev          # 前端開發伺服器
npm test             # Vitest
npm run build        # 型別檢查 + 建置
npm run lint         # oxlint
supabase start       # 本機 Supabase（需要 Docker / OrbStack）
supabase db reset    # 重新套用所有 migrations
supabase test db     # 執行 pgTAP 測試
```
