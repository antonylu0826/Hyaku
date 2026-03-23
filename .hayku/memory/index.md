# Hayku 記憶索引

## 專案記憶 (projects/)
- [hayku-genesis.md](projects/hayku-genesis.md) — Hayku Agent 自身的設計決策與架構

## 決策記錄 (decisions/)
- [001-architecture.md](decisions/001-architecture.md) — 選擇方案 A（由內而外）及核心架構設計
- [002-identity-system.md](decisions/002-identity-system.md) — 第一個專案選擇身份系統，TypeScript 技術選型

## 經驗學習 (learnings/)
- [001-autonomy.md](learnings/001-autonomy.md) — Hayku 必須更自主規劃和執行，不要頻繁停下來問使用者
- [002-middleware-per-route.md](learnings/002-middleware-per-route.md) — Hono 認證中介層必須明確掛載到每個需要保護的路由
- [003-docker-deployment.md](learnings/003-docker-deployment.md) — Docker 部署踩坑：packages 編譯、路徑一致性、命名去重、init-db、lock file

## 決策記錄 (decisions/)
- [003-audit-service.md](decisions/003-audit-service.md) — 第二個服務選擇審計日誌，滿足企業合規需求
- [004-procurement-system.md](decisions/004-procurement-system.md) — 採購系統拆分為 product-catalog + supplier + procurement 三個微服務
- [005-identity-provider-architecture.md](decisions/005-identity-provider-architecture.md) — hayku-identity 採用完整 IdP 架構（選項 A），可插拔 IdP 介面，支援跨公司部署
