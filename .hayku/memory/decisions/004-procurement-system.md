---
created: 2026-03-23
tags: [procurement, architecture, microservices, decomposition]
---

# 採購系統架構決策

## 決策

將採購系統分解為三個獨立微服務：`product-catalog`（3300）、`supplier`（3301）、`procurement`（3302）。

## 分解邏輯

- **product-catalog** — 品項有獨立資料模型，未來銷售、倉儲系統也會用到 → 原子服務
- **supplier** — 供應商資料獨立，未來付款、評估系統也會用到 → 原子服務
- **procurement** — PR/PO 流程邏輯依賴品項和供應商 → 組合服務

## 設計決策

1. **採購單儲存供應商快照**：`purchaseOrders` 直接存 `supplierName`/`supplierCode`，避免運行時跨服務查詢，保持歷史資料完整性
2. **軟刪除**：product/supplier 使用 `isActive=false`，不硬刪除
3. **PR 狀態機**：draft → submitted → approved/rejected → ordered/cancelled
4. **PO 到貨判斷**：自動比對 receivedQuantity vs quantity 判斷 partial/received 狀態
5. **序號生成**：目前用日期+隨機序號，生產環境應改用 DB sequence

## 各服務 DB port

| 服務 | DB port |
|------|---------|
| product-catalog | 5433 |
| supplier | 5434 |
| procurement | 5435 |

## 脈絡

使用者要求建立採購系統，按 CLAUDE.md 需求分解流程拆解為三個微服務後順序建構。
