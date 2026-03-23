---
created: 2026-03-23
tags: [決策, 架構, 審計]
---

# 第二個核心服務：審計日誌（hayku-audit）

## 決策
在 hayku-identity 完成後，建立 hayku-audit 作為第二個核心微服務。

## 原因
1. 企業合規需求 — 所有操作必須有跡可循
2. 安全事件追溯 — 登入失敗、權限變更等需記錄
3. 跨服務共用 — 所有微服務都需要寫審計日誌
4. 技術棧一致 — TypeScript + Hono + Drizzle + PostgreSQL

## 設計要點
- Immutable：事件寫入後不可修改/刪除
- 批次寫入：支援最多 1000 筆/次
- 結構化查詢：按 actor/action/resource/service/outcome/時間範圍篩選
- 服務間認證：透過 hayku-identity 的 API Key
- Port: 3200（identity 用 3100）
