import { loadEnv } from '@hayku/env';
loadEnv(import.meta.dirname);

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { initKeys } from './oidc/keys.js';
import { authMiddleware } from './auth/index.js';
import { auth } from './routes/auth.js';
import { orgs } from './routes/orgs.js';
import { perms } from './routes/permissions.js';
import { apiKeys } from './routes/api-keys.js';
import { oidc } from './routes/oidc.js';
import { mfa } from './routes/mfa.js';
import { ensureDefaultAdmin, ensureDevOauthClient } from './seed.js';

// 初始化 RSA 金鑰（OIDC RS256 簽發用）
initKeys();

const app = new Hono();

// 全域錯誤處理
app.onError((err, c) => {
  // JSON 解析錯誤
  if (err.message?.includes('Unexpected') || err.message?.includes('JSON')) {
    return c.json({ error: '無效的 JSON 格式' }, 400);
  }

  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: '伺服器內部錯誤' }, 500);
});

// 全域中介層
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'hayku-identity', version: '0.1.0' }));

// OIDC 路由（公開）
app.route('/', oidc);

// 公開路由（不需要 token）
app.route('/auth', auth);

// 需要認證的路由 — /auth/me 在 auth router 內部自行處理
app.use('/orgs/*', authMiddleware);
app.route('/orgs', orgs);

app.route('/permissions', perms);

app.route('/api-keys', apiKeys);

app.route('/auth/mfa', mfa);

// 啟動伺服器
console.log(`🔐 Hayku Identity 啟動中... port ${config.port}`);
serve({
  fetch: app.fetch,
  port: config.port,
});
console.log(`✅ Hayku Identity 已啟動: http://localhost:${config.port}`);

// 確保預設管理員與開發用 OAuth client 存在
ensureDefaultAdmin().catch((err) => {
  console.error('❌ 建立預設管理員失敗:', err.message);
});
ensureDevOauthClient().catch((err) => {
  console.error('❌ 建立開發用 OAuth client 失敗:', err.message);
});
