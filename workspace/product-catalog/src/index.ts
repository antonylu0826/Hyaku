import { loadEnv } from '@hayku/env';
loadEnv(import.meta.dirname);

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { categories } from './routes/categories.js';
import { products } from './routes/products.js';
import { units } from './routes/units.js';

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

app.get('/health', (c) => c.json({ status: 'ok', service: 'product-catalog', version: '0.1.0' }));

app.route('/categories', categories);
app.route('/units', units);
app.route('/products', products);

console.log(`📦 Hayku Product Catalog 啟動中... port ${config.port}`);
serve({
  fetch: app.fetch,
  port: config.port,
});
console.log(`✅ Hayku Product Catalog 已啟動: http://localhost:${config.port}`);
