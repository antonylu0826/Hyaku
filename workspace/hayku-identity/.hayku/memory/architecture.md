---
created: 2026-03-23
tags: [架構, 技術選型]
---

# hayku-identity 架構

## 服務資訊
- Port: 3100
- Entry: src/index.ts
- DB: PostgreSQL (Docker Compose)

## 路由結構
- `/auth/register` — 註冊（公開）
- `/auth/login` — 登入（公開）
- `/auth/me` — 取得目前使用者（需 JWT，per-route middleware）
- `/orgs/*` — 組織 CRUD（需 JWT）
- `/permissions/*` — 權限定義與查詢（需 JWT）

## 資料模型（7 tables）
- users — 使用者帳號
- organizations — 組織
- departments — 部門（隸屬組織）
- orgMembers — 組織成員
- roles — 角色（隸屬組織）
- permissions — 權限定義（resource + action）
- rolePermissions — 角色-權限關聯
- memberRoles — 成員-角色關聯

## 認證流程
1. 註冊/登入取得 JWT
2. JWT payload: { sub, email, isSuperAdmin }
3. authMiddleware 驗證 JWT 並寫入 c.set('user', payload)
4. RBAC engine 查詢 orgMember → memberRoles → roles → rolePermissions → permissions

## 關鍵決策
- authMiddleware 必須 per-route 掛載（見 learnings/002）
- 密碼用 bcrypt (salt rounds: 12)
- JWT secret 從環境變數讀取
