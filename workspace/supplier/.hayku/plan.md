---
created: 2026-03-23
tags: [supplier, procurement, atomic-service]
---

# Supplier 服務規劃

## 概述

供應商管理服務 — 採購系統的原子服務之一。管理供應商基本資料和聯絡人。

## API 端點

### 供應商管理 `/suppliers`
- `GET /suppliers` — 列出供應商（支援 search/isActive 過濾）
- `GET /suppliers/:id` — 取得供應商詳情（含聯絡人）
- `POST /suppliers` — 建立供應商（需認證）
- `PATCH /suppliers/:id` — 更新供應商（需認證）
- `DELETE /suppliers/:id` — 停用供應商（軟刪除，需認證）

### 聯絡人管理 `/suppliers/:id/contacts`
- `GET /suppliers/:id/contacts` — 列出聯絡人
- `POST /suppliers/:id/contacts` — 新增聯絡人（需認證）
- `PATCH /suppliers/:id/contacts/:contactId` — 更新聯絡人（需認證）
- `DELETE /suppliers/:id/contacts/:contactId` — 刪除聯絡人（需認證）

## 資料模型

- `suppliers` — 供應商（代碼、統編、聯絡資訊、付款條件）
- `supplier_contacts` — 供應商聯絡人（姓名、職稱、電話、Email）

## 依賴

- `hayku-identity` — JWT 驗證
- `hayku-audit` — 寫入操作審計

## 狀態

- [x] 服務架構建立
- [ ] npm install
- [ ] DB migration
- [ ] 整合測試
