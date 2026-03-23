# Hayku Audit — 企業審計日誌服務

## 目標
提供統一的審計日誌記錄與查詢服務。所有 Hayku 微服務將操作事件寫入此服務，支援合規查核、安全事件追溯、操作歷程查詢。

## 技術棧
- Runtime: Node.js + TypeScript
- Framework: Hono
- ORM: Drizzle
- Database: PostgreSQL（與 identity 共用 Docker Compose 或獨立）
- Auth: 透過 hayku-identity 的 API Key 認證
- Deploy: Docker Compose

## MVP 功能
- [ ] 資料模型（AuditEvent）
- [ ] 寫入 API（POST /events）
- [ ] 查詢 API（GET /events + 篩選/分頁）
- [ ] API Key 認證（接入 hayku-identity）
- [ ] Docker Compose 部署
- [ ] 測試

## 設計原則
- Write-only：日誌一旦寫入不可修改或刪除（immutable）
- 高吞吐：支援批次寫入
- 結構化：每筆事件有 actor, action, resource, metadata
- 可查詢：按時間、actor、action、resource 篩選
