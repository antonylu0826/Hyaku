# Hayku Deployer

自動化部署工具 — 讀取 `workspace/registry.json`，自動產生 Docker 部署配置並執行。

## 用法

```bash
# 產生部署配置（docker-compose.yml + init-db.sh）
node .hayku/tools/generated/deployer/tool.mjs generate

# 建構所有 Docker images
node .hayku/tools/generated/deployer/tool.mjs build

# 啟動所有服務
node .hayku/tools/generated/deployer/tool.mjs up

# 一鍵完成（generate → build → up）
node .hayku/tools/generated/deployer/tool.mjs deploy

# 查看狀態 + 健康檢查
node .hayku/tools/generated/deployer/tool.mjs status

# 停止所有服務
node .hayku/tools/generated/deployer/tool.mjs down

# 查看日誌
node .hayku/tools/generated/deployer/tool.mjs logs [service-name]
```

## 運作原理

1. 讀取 `workspace/registry.json` 中的所有服務
2. 根據每個服務的 type、port、dependencies 自動產生：
   - `docker/init-db.sh` — 初始化所有 database
   - `docker-compose.yml` — 完整的服務編排
3. 服務間的依賴關係（depends_on）從 registry 的 dependencies 推導
4. 環境變數根據服務的 capabilities 和 dependencies 自動推斷

## 新增服務後

只要在 registry.json 註冊新服務，重新執行 `generate` 即可更新部署配置。
