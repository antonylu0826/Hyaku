# Hayku Staging Deployer

測試區一鍵部署工具。將所有 Hayku 服務部署到獨立的 staging 環境，與 dev 完全隔離。

## 快速開始

```bash
# 從 monorepo 根目錄執行
node .hayku/tools/generated/staging-deployer/tool.mjs deploy
```

## 指令

| 指令 | 說明 |
|------|------|
| `deploy [service]` | 部署 staging（全部或指定服務），自動執行 DB 遷移 |
| `status` | 查看所有 staging 容器狀態與端口 |
| `stop [service]` | 停止 staging 服務 |
| `logs <service> [-n N]` | 查看服務日誌（預設 50 行） |
| `migrate` | 單獨對 staging DB 執行 Drizzle 遷移 |
| `reset --confirm` | ⚠ 清除所有 staging 資料（volumes）並重新部署 |

## Staging 環境規格

| 項目 | Staging | Dev |
|------|---------|-----|
| identity port | **4100** | 3100 |
| audit port | **4200** | 3200 |
| DB port | **5433** | 5432 |
| container prefix | `hayku-staging-*` | `hayku-*` |
| volume | `pgdata_staging` | `pgdata` |
| network | `hayku-staging` | `hayku_default` |
| DB names | `*_staging` | 無後綴 |

## 環境變數

首次執行 `deploy` 時自動從 `.env` 產生 `.env.staging`，並覆蓋以下值：

```
NODE_ENV=staging
OIDC_ISSUER=http://localhost:4100
JWT_SECRET=hayku-staging-<random>
STAGING_DB_PORT=5433
STAGING_IDENTITY_PORT=4100
STAGING_AUDIT_PORT=4200
```

`.env.staging` 不會進入 git（`.gitignore` 排除）。

## 遷移機制

`deploy` 完成後自動執行 Drizzle 遷移（讀取各服務 `drizzle/meta/_journal.json`）。
遷移追蹤透過各 DB 的 `__drizzle_migrations` 表，已套用的不重複執行。

## 安全等級

**Level 3** — 可執行 `docker-compose`、可刪除 staging volumes（`reset` 指令）。
必須由使用者明確執行，Agent 不會自動觸發。
