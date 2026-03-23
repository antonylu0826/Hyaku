---
created: 2026-03-23
tags: [身份系統, 架構, 決策, TypeScript]
---

# 決策 002：第一個專案選擇身份系統 + 技術選型

## 決策

1. **第一個專案：企業身份系統 (hayku-identity)**
   - 身份系統是所有企業系統的地基，先建地基再蓋樓
   - 沒有它，後續系統（知識庫、審批、報表）都無法做權限控管

2. **技術選型：TypeScript**
   - 後端框架：Hono（輕量、快速、邊緣友好）
   - ORM：Drizzle（型別安全、輕量）
   - 資料庫：PostgreSQL
   - 認證：JWT + bcrypt（內建引擎），可插拔外部 IdP
   - 部署：Docker Compose

3. **架構：自建管理層 + 可插拔認證引擎**
   - 自己寫：使用者/組織/角色管理、RBAC 權限引擎、統一 API
   - 可插拔：認證引擎（內建 JWT → 未來接 Keycloak / Azure AD / Google）

## 原因

- 使用者規模從十人到千人都要支援 → 需要可伸縮架構
- 很大機率需要整合現有 IdP（Google Workspace、Azure AD）→ 認證引擎必須可插拔
- Docker / 雲端都要能部署 → 容器化優先
- TypeScript 前後端統一語言，型別安全，生態豐富

## MVP 範圍

- 使用者註冊 / 登入 / 登出（JWT）
- 組織 + 部門結構
- 角色 + 權限（RBAC）
- 權限檢查 API
- Docker Compose 一鍵部署

## 未來擴展

- OAuth Provider / SAML
- 外部 IdP 整合
- MFA
- 審計日誌
