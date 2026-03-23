# ============================================================
# Hayku 通用微服務 Dockerfile
# Build context 必須是 Hayku 根目錄
# 用法：docker build -f docker/Dockerfile --build-arg SERVICE=hayku-identity .
# ============================================================

ARG NODE_VERSION=22

# ── Stage 1: Install & Build ──
FROM node:${NODE_VERSION}-alpine AS builder

ARG SERVICE
WORKDIR /app

# 先複製共用 packages 並編譯
COPY packages/ ./packages/
RUN cd packages/env && npm install && npm run build \
 && cd ../audit-client && npm install && npm run build

# 複製服務的 package 檔案並安裝依賴
COPY workspace/${SERVICE}/package*.json ./workspace/${SERVICE}/
WORKDIR /app/workspace/${SERVICE}
RUN npm ci

# 複製服務原始碼並編譯
COPY workspace/${SERVICE}/tsconfig.json ./
COPY workspace/${SERVICE}/src/ ./src/
RUN npm run build

# 複製 drizzle config + migrations（如果有）
COPY workspace/${SERVICE}/drizzle* ./

# ── Stage 2: Production ──
FROM node:${NODE_VERSION}-alpine

ARG SERVICE
WORKDIR /app

# 編譯後的共用 packages（保持相對路徑一致）
COPY --from=builder /app/packages/ ./packages/

# 服務的 production 依賴
COPY workspace/${SERVICE}/package*.json ./workspace/${SERVICE}/
WORKDIR /app/workspace/${SERVICE}
RUN npm ci --omit=dev

# 編譯後的程式碼
COPY --from=builder /app/workspace/${SERVICE}/dist ./dist

# Drizzle config + migrations（如果有）
COPY --from=builder /app/workspace/${SERVICE}/drizzle* ./

# 根目錄 .env 不 COPY — 由 docker-compose 的 env_file 注入

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
