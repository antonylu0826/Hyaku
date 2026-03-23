import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, createApiKey, listApiKeys, revokeApiKey } from '../auth/index.js';

const apiKeys = new Hono();

// 所有 API Key 路由都需要認證
apiKeys.use('/*', authMiddleware);

const createKeySchema = z.object({
  name: z.string().min(1, 'API Key 名稱不可為空').max(255),
  scopes: z.array(z.string().max(255)).max(50).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

// POST /api-keys — 建立新 API Key
apiKeys.post('/', async (c) => {
  const payload = c.get('user');
  const body = await c.req.json();
  const parsed = createKeySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const result = await createApiKey({
    userId: payload.sub,
    name: parsed.data.name,
    scopes: parsed.data.scopes,
    expiresInDays: parsed.data.expiresInDays,
  });

  return c.json({
    ...result,
    _warning: 'API Key 明文只會顯示這一次，請妥善保存',
  }, 201);
});

// GET /api-keys — 列出目前使用者的所有 API Key
apiKeys.get('/', async (c) => {
  const payload = c.get('user');
  const keys = await listApiKeys(payload.sub);
  return c.json({ keys });
});

// DELETE /api-keys/:id — 撤銷 API Key
apiKeys.delete('/:id', async (c) => {
  const payload = c.get('user');
  const keyId = c.req.param('id');

  const success = await revokeApiKey(keyId, payload.sub);
  if (!success) {
    return c.json({ error: 'API Key 不存在或已撤銷' }, 404);
  }

  return c.json({ message: 'API Key 已撤銷' });
});

export { apiKeys };
