---
created: 2026-03-23
tags: [identity, sso, oauth2, oidc, architecture]
---

# 決策：hayku-identity 採用完整 IdP 架構（選項 A）

## 決策

hayku-identity 擴充為完整的 Identity Provider，自身具備可插拔的 IdP 介面，
對下游業務服務提供標準 OIDC 協定。

## 架構

```
外部 IdP（可插拔）
├── OIDC Provider — Google / Azure AD / Keycloak
├── SAML Provider — 企業 AD FS
└── LDAP Provider — 直接接 AD

hayku-identity（Identity Core）
├── 本地帳號（永遠可用：admin / service accounts）
├── 組織 / 部門 / RBAC / API Key
├── MFA
└── Session 管理（SSO cookie）

↓ 標準 OIDC

所有業務服務（不感知上游任何變化）
```

## 原因

1. **IdP 未確定**：目前用 AD，評估中的有 Keycloak 和 Google OAuth，不應綁定任何一個
2. **出差場景**：員工在外需要從網際網路登入，AD 是內網系統，需要可對外的認證層
3. **跨公司部署**：未來部署到不同企業環境時，只需切換 provider 設定，業務服務不動
4. **自主性**：不依賴外部系統（如 Keycloak），本地帳號永遠可用作 fallback

## 被捨棄的方案

- **選項 B（Keycloak 橋接）**：依賴 Keycloak 穩定運行，IdP 切換需改架構，不夠靈活
- **直接各服務各自整合 IdP**：沒有 SSO 效果，換 IdP 要改所有服務

## 分階段實作計畫

| 階段 | 內容 | 優先級 |
|------|------|--------|
| Phase 1 | 本地帳號 + OIDC Client（Google）+ MFA | 高（出差場景） |
| Phase 2 | LDAP/AD 直接整合 | 高（現有環境） |
| Phase 3 | OIDC Server 對下游業務服務 | 高（SSO） |
| Phase 4 | SAML Provider / Keycloak | 依需求 |

## 脈絡

用戶目前使用 AD，評估轉用 Keycloak 或 Google OAuth。
員工出差需從網路存取系統。
未來可能部署到不同企業環境，需要快速切換 IdP。
