# Hayku Identity — 企業身份系統

## 目標
為所有 Hayku 系統提供統一的身份認證與授權服務。

## 技術棧
- Runtime: Node.js + TypeScript
- Framework: Hono
- ORM: Drizzle
- Database: PostgreSQL
- Auth: JWT + bcrypt（可插拔）
- Deploy: Docker Compose

## MVP 功能
- [x] 專案結構建立
- [x] 資料模型（User, Organization, Department, Role, Permission）
- [x] 認證模組（註冊/登入/JWT）
- [x] RBAC 權限引擎
- [x] API 路由（auth, orgs, permissions）
- [x] Docker Compose 部署
- [x] 16/16 API 測試通過

## Phase 2 — 強化
- [x] Refresh Token 機制（rotation + 自動撤銷）
- [x] 密碼重設流程（token-based, 防帳號列舉）
- [x] API Key 管理（建立/列表/撤銷, hk_ prefix）
- [ ] 帳號停用/啟用
- [ ] 登入日誌與安全告警

## Phase 3 — IdP 整合
- [ ] OAuth 2.0 provider（Google, Microsoft）
- [ ] SAML 2.0 支援
- [ ] LDAP/AD 連接器
