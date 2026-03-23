import { loadEnv } from '@hayku/env';
loadEnv(import.meta.dirname);

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { apiKeyAuth } from './auth.js';
import { events } from './routes/events.js';

const app = new Hono();

// 全域錯誤處理
app.onError((err, c) => {
  if (err.message?.includes('Unexpected') || err.message?.includes('JSON')) {
    return c.json({ error: '無效的 JSON 格式' }, 400);
  }

  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: '伺服器內部錯誤' }, 500);
});

// 全域中介層
app.use('*', logger());
app.use('*', cors());

// Health check（不需認證）
app.get('/health', (c) => c.json({ status: 'ok', service: 'hayku-audit', version: '0.1.0' }));

// 需要認證的路由
app.use('/events/*', apiKeyAuth);
app.route('/events', events);

// 啟動伺服器
console.log(`📋 Hayku Audit 啟動中... port ${config.port}`);
serve({
  fetch: app.fetch,
  port: config.port,
});
console.log(`✅ Hayku Audit 已啟動: http://localhost:${config.port}`);
