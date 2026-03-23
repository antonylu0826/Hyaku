import { loadEnv } from '@hayku/env';
loadEnv(import.meta.dirname);

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { prs } from './routes/purchase-requests.js';
import { pos } from './routes/purchase-orders.js';

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

app.get('/health', (c) => c.json({
  status: 'ok',
  service: 'procurement',
  version: '0.1.0',
  dependencies: {
    productCatalog: config.services.productCatalog,
    supplier: config.services.supplier,
  },
}));

app.route('/purchase-requests', prs);
app.route('/purchase-orders', pos);

console.log(`🛒 Hayku Procurement 啟動中... port ${config.port}`);
serve({
  fetch: app.fetch,
  port: config.port,
});
console.log(`✅ Hayku Procurement 已啟動: http://localhost:${config.port}`);
