import { loadEnv } from '@hayku/env';
loadEnv(import.meta.dirname);

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { suppliers } from './routes/suppliers.js';

const app = new Hono();

app.onError((err, c) => {
  if (err.message?.includes('Unexpected') || err.message?.includes('JSON')) {
    return c.json({ error: '無效的 JSON 格式' }, 400);
  }
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: '伺服器內部錯誤' }, 500);
});

app.use('*', logger());
app.use('*', cors());

app.get('/health', (c) => c.json({ status: 'ok', service: 'supplier', version: '0.1.0' }));

app.route('/suppliers', suppliers);

console.log(`🏭 Hayku Supplier 啟動中... port ${config.port}`);
serve({
  fetch: app.fetch,
  port: config.port,
});
console.log(`✅ Hayku Supplier 已啟動: http://localhost:${config.port}`);
