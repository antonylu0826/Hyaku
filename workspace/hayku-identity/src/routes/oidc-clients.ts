import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { authMiddleware, superAdminMiddleware } from '../auth/index.js';

const clients = new Hono();
clients.use('*', authMiddleware);
clients.use('*', superAdminMiddleware);

// ─── 輸入驗證 Schema ───────────────────────────────────────────

const CreateClientSchema = z.object({
  name: z.string().min(1).max(255),
  redirectUris: z.array(z.string().url()).min(1),
  scopes: z.array(z.string()).optional(),
  isPublic: z.boolean().optional().default(false), // true = PKCE only，不需要 client_secret
});

const UpdateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  redirectUris: z.array(z.string().url()).min(1).optional(),
  scopes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// ─── GET /auth/oidc-clients — 列出所有 OIDC 客戶端 ───────────

clients.get('/', async (c) => {
  const rows = await db.query.oauthClients.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return c.json(rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    name: r.name,
    redirectUris: JSON.parse(r.redirectUris) as string[],
    scopes: JSON.parse(r.scopes) as string[],
    isPublic: !r.clientSecret,
    isActive: r.isActive,
    createdAt: r.createdAt,
  })));
});

// ─── POST /auth/oidc-clients — 建立新客戶端 ──────────────────

clients.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { name, redirectUris, scopes, isPublic } = parsed.data;

  const clientId = `hayku-${randomBytes(8).toString('hex')}`;
  const clientSecret = isPublic ? null : randomBytes(32).toString('hex');

  const [created] = await db.insert(schema.oauthClients).values({
    clientId,
    clientSecret,
    name,
    redirectUris: JSON.stringify(redirectUris),
    scopes: JSON.stringify(scopes ?? ['openid', 'profile', 'email']),
    isActive: true,
  }).returning();

  return c.json({
    id: created.id,
    clientId: created.clientId,
    clientSecret,           // 只在建立時回傳一次，之後無法再取得
    name: created.name,
    redirectUris,
    scopes: scopes ?? ['openid', 'profile', 'email'],
    isPublic,
    isActive: true,
    createdAt: created.createdAt,
    _note: clientSecret ? '請妥善保存 clientSecret，此後不會再顯示' : 'Public client（PKCE only），無 clientSecret',
  }, 201);
});

// ─── GET /auth/oidc-clients/:id — 查詢單一客戶端 ─────────────

clients.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await db.query.oauthClients.findFirst({
    where: eq(schema.oauthClients.id, id),
  });
  if (!row) return c.json({ error: '找不到該 OIDC 客戶端' }, 404);

  return c.json({
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    redirectUris: JSON.parse(row.redirectUris) as string[],
    scopes: JSON.parse(row.scopes) as string[],
    isPublic: !row.clientSecret,
    isActive: row.isActive,
    createdAt: row.createdAt,
  });
});

// ─── PATCH /auth/oidc-clients/:id — 更新客戶端設定 ───────────

clients.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateClientSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const existing = await db.query.oauthClients.findFirst({
    where: eq(schema.oauthClients.id, id),
  });
  if (!existing) return c.json({ error: '找不到該 OIDC 客戶端' }, 404);

  const updates: Partial<typeof schema.oauthClients.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.redirectUris !== undefined) updates.redirectUris = JSON.stringify(parsed.data.redirectUris);
  if (parsed.data.scopes !== undefined) updates.scopes = JSON.stringify(parsed.data.scopes);
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  if (Object.keys(updates).length === 0) return c.json({ error: '沒有要更新的欄位' }, 400);

  const [updated] = await db.update(schema.oauthClients)
    .set(updates)
    .where(eq(schema.oauthClients.id, id))
    .returning();

  return c.json({
    id: updated.id,
    clientId: updated.clientId,
    name: updated.name,
    redirectUris: JSON.parse(updated.redirectUris) as string[],
    scopes: JSON.parse(updated.scopes) as string[],
    isPublic: !updated.clientSecret,
    isActive: updated.isActive,
  });
});

// ─── POST /auth/oidc-clients/:id/rotate-secret — 輪換 client_secret ──

clients.post('/:id/rotate-secret', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.oauthClients.findFirst({
    where: eq(schema.oauthClients.id, id),
  });
  if (!existing) return c.json({ error: '找不到該 OIDC 客戶端' }, 404);
  if (!existing.clientSecret) return c.json({ error: 'Public client 沒有 clientSecret' }, 400);

  const newSecret = randomBytes(32).toString('hex');
  await db.update(schema.oauthClients)
    .set({ clientSecret: newSecret })
    .where(eq(schema.oauthClients.id, id));

  return c.json({
    clientId: existing.clientId,
    clientSecret: newSecret,
    _note: '請立即更新所有使用此 client 的應用程式設定',
  });
});

// ─── DELETE /auth/oidc-clients/:id — 停用客戶端 ──────────────

clients.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.oauthClients.findFirst({
    where: eq(schema.oauthClients.id, id),
  });
  if (!existing) return c.json({ error: '找不到該 OIDC 客戶端' }, 404);

  // 軟刪除：停用而非物理刪除（保留審計記錄）
  await db.update(schema.oauthClients)
    .set({ isActive: false })
    .where(eq(schema.oauthClients.id, id));

  return c.json({ message: `OIDC 客戶端 ${existing.clientId} 已停用` });
});

export { clients as oidcClients };
