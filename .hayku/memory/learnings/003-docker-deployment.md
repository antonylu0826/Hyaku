---
created: 2026-03-23
tags: [docker, deployment, packages, monorepo]
---

# Docker 部署踩坑經驗

## 1. Packages 必須可編譯

`@hayku/env` 和 `@hayku/audit-client` 的 `exports` 原本指向 `.ts`，開發環境靠 tsx 解析沒問題，但 Docker 生產環境用 `node dist/index.js` 無法 import TypeScript。

**解法**：每個 package 必須有 `tsconfig.json`、`build` script、`@types/node`，且 `exports` 用條件式匯出：
```json
"exports": {
  ".": {
    "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "default": "./src/index.ts"
  }
}
```
Dockerfile builder stage 先 `cd packages/env && npm install && npm run build`。

## 2. Dockerfile 路徑一致性

Monorepo 中 `package.json` 用 `file:../../packages/env`，Dockerfile 的 Stage 2 必須保持相同的目錄結構（`/app/workspace/{SERVICE}/`），否則 `npm ci` 時 `file:` 相對路徑會壞掉。

## 3. Docker Compose 指令偵測

Windows 上 `docker compose`（plugin 版）和 `docker-compose`（standalone）不同。Deployer 工具應在執行前偵測可用指令，或直接用 standalone 版本。

## 4. 命名前綴去重

registry.json 的 `name` 如果已包含 `hayku-`（如 `hayku-identity`），deployer 產生 container name 和 DB name 時不可再加 `hayku-` 前綴。需要 `name.replace(/^hayku-/, '')` 處理。

## 5. PostgreSQL init-db.sh

psql 預設連到跟 username 同名的 database。init-db.sh 中必須加 `--dbname "$POSTGRES_DB"` 指定連到 docker-entrypoint 已建立的 database。

## 6. package-lock.json

新建服務後必須執行 `npm install --package-lock-only` 產生 lock file，否則 Docker 中 `npm ci` 會失敗。

## 7. .dockerignore

Monorepo build context 容易過大。必須排除 `**/node_modules`、`**/dist`、`.git`、`.hayku`。

## 脈絡
首次測試 deployer 工具的完整部署流程（generate → build → up）時遇到以上所有問題，逐一修正後全部 5 個服務成功部署並通過 health check。
