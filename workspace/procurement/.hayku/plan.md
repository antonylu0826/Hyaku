---
created: 2026-03-23
tags: [procurement, business-service, composite-service]
---

# Procurement 服務規劃

## 概述

採購流程管理服務 — 採購系統的組合服務。管理採購申請單（PR）和採購單（PO）的完整生命週期。

## 採購申請流程

```
草稿(draft) → 已提交(submitted) → 已核准(approved) → 已轉採購(ordered)
                                 → 已退回(rejected)
           → 已取消(cancelled)
```

## 採購單流程

```
草稿(draft) → 已發送(sent) → 供應商確認(confirmed) → 部分到貨(partial) → 全部到貨(received)
           → 已取消(cancelled)
```

## API 端點

### 採購申請單 `/purchase-requests`
- `GET /purchase-requests` — 列出申請單（支援 status/requesterId 過濾）
- `GET /purchase-requests/:id` — 取得申請單詳情（含明細）
- `POST /purchase-requests` — 建立申請單（含明細，需認證）
- `PATCH /purchase-requests/:id` — 更新申請單（草稿狀態，需認證）
- `POST /purchase-requests/:id/submit` — 提交審核
- `POST /purchase-requests/:id/review` — 核准或退回
- `POST /purchase-requests/:id/cancel` — 取消

### 採購單 `/purchase-orders`
- `GET /purchase-orders` — 列出採購單（支援 status/supplierId 過濾）
- `GET /purchase-orders/:id` — 取得採購單詳情（含明細）
- `POST /purchase-orders` — 建立採購單（含明細，需認證）
- `PATCH /purchase-orders/:id/status` — 更新採購單狀態
- `POST /purchase-orders/:id/receive` — 記錄到貨數量

## 資料模型

- `purchase_requests` — 採購申請單（標頭）
- `purchase_request_items` — 採購申請單明細
- `purchase_orders` — 採購單（標頭）
- `purchase_order_items` — 採購單明細

## 依賴服務

- `hayku-identity` — JWT 驗證（port 3100）
- `hayku-audit` — 寫入操作審計（port 3200）
- `product-catalog` — 品項資料（port 3300）
- `supplier` — 供應商資料（port 3301）

## 狀態

- [x] 服務架構建立
- [ ] npm install
- [ ] DB migration
- [ ] 整合測試
