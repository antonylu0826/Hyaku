---
created: 2026-03-23
tags: [bug, Hono, middleware, 認證]
---

# 認證中介層必須明確掛載到每個需要保護的路由

## 教訓

在 Hono 中，如果某個路由（如 `/auth/me`）位於一個公開的 router 群組裡（如 `/auth`），即使程式碼中用了 `c.get('user')` 嘗試取得認證資訊，如果沒有明確掛載 `authMiddleware`，`c.get('user')` 會是 undefined，導致 401。

## 修復方式

對混合了公開和需認證路由的 router，用 per-route middleware：
```typescript
auth.get('/me', authMiddleware, async (c) => { ... })
```

## 脈絡

hayku-identity 的 `/auth/me` 在首次 API 測試中失敗，因為 `authMiddleware` 只掛在 `/orgs/*` 上。
