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
- [x] 帳號停用/啟用（superAdmin, 停用時自動撤銷所有 token）
- [x] 登入日誌（成功/失敗/封鎖，記錄 IP + User-Agent）
- [x] 使用者管理 API（列出所有使用者，superAdmin）

## Phase 3 — OIDC Server + IdP 整合（已完成）
- [x] OIDC Server（Authorization Code Flow + PKCE, RS256 JWT, JWKS）
- [x] SSO cookie session（httpOnly, identity_sessions DB）
- [x] Google OAuth（ExternalProvider 介面，state 編碼 OIDC params）
- [x] TOTP MFA（RFC 6238 純 Node.js 實作，pending session bridge）
- [x] LDAP/AD 連接器（ldapts，兩段式 bind，自動建立本地使用者）
- [x] 登入頁 HTML（多 provider，MFA 驗證頁）
- [x] 資安掃描通過、19/19 API 測試通過

## 待規劃
- [ ] SAML 2.0 支援（如有需要）
- [ ] Microsoft Entra ID（OIDC/SAML）
