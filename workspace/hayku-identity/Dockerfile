FROM node:22-alpine AS builder

WORKDIR /app

# 複製並建構 monorepo packages
COPY packages/env/package.json ./packages/env/
RUN cd packages/env && npm install
COPY packages/env/tsconfig.json ./packages/env/
COPY packages/env/src ./packages/env/src
RUN cd packages/env && npm run build

# 複製並建構服務
COPY workspace/hayku-identity/package.json ./workspace/hayku-identity/
RUN cd workspace/hayku-identity && npm install

COPY workspace/hayku-identity/tsconfig.json ./workspace/hayku-identity/
COPY workspace/hayku-identity/src ./workspace/hayku-identity/src
RUN cd workspace/hayku-identity && npm run build

FROM node:22-alpine

WORKDIR /app

# 複製 packages/env dist（供 runtime 使用）
COPY --from=builder /app/packages/env/dist ./packages/env/dist
COPY packages/env/package.json ./packages/env/

# 安裝服務 production 依賴
COPY workspace/hayku-identity/package.json ./workspace/hayku-identity/
RUN cd workspace/hayku-identity && npm install --omit=dev

COPY --from=builder /app/workspace/hayku-identity/dist ./workspace/hayku-identity/dist
COPY workspace/hayku-identity/drizzle ./workspace/hayku-identity/drizzle

WORKDIR /app/workspace/hayku-identity

ENV NODE_ENV=production
EXPOSE 3100

CMD ["node", "dist/index.js"]
