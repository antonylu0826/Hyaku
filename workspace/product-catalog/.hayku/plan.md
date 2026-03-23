---
created: 2026-03-23
tags: [product-catalog, procurement, atomic-service]
---

# Product Catalog 服務規劃

## 概述

品項目錄管理服務 — 採購系統的原子服務之一。管理可採購的品項、分類與計量單位。

## API 端點

### 分類管理 `/categories`
- `GET /categories` — 列出所有分類
- `GET /categories/:id` — 取得分類詳情
- `POST /categories` — 建立分類（需認證）
- `PATCH /categories/:id` — 更新分類（需認證）
- `DELETE /categories/:id` — 刪除分類（需認證）

### 計量單位 `/units`
- `GET /units` — 列出所有單位
- `POST /units` — 建立單位（需認證）
- `DELETE /units/:id` — 刪除單位（需認證）

### 品項管理 `/products`
- `GET /products` — 列出品項（支援 search/categoryId/isActive 過濾）
- `GET /products/:id` — 取得品項詳情
- `POST /products` — 建立品項（需認證）
- `PATCH /products/:id` — 更新品項（需認證）
- `DELETE /products/:id` — 停用品項（軟刪除，需認證）

## 資料模型

- `categories` — 品項分類（支援父子層級）
- `units` — 計量單位（PCS, BOX, KG 等）
- `products` — 品項（品號、名稱、規格、參考價格）

## 依賴

- `hayku-identity` — JWT 驗證
- `hayku-audit` — 寫入操作審計

## 狀態

- [x] 服務架構建立
- [ ] npm install
- [ ] DB migration
- [ ] 整合測試
