import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../auth.js';
import { createCategorySchema, updateCategorySchema } from '../validators.js';
import { audit } from '../audit.js';

const categories = new Hono();

categories.use('/*', authMiddleware);

// GET /categories — 列出所有分類
categories.get('/', async (c) => {
  const items = await db.query.categories.findMany({
    orderBy: (t, { asc }) => [asc(t.code)],
  });
  return c.json(items);
});

// GET /categories/:id
categories.get('/:id', async (c) => {
  const id = c.req.param('id');
  const item = await db.query.categories.findFirst({
    where: eq(schema.categories.id, id),
  });
  if (!item) return c.json({ error: '分類不存在' }, 404);
  return c.json(item);
});

// POST /categories
categories.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.query.categories.findFirst({
    where: eq(schema.categories.code, parsed.data.code),
  });
  if (existing) {
    return c.json({ error: '此分類代碼已存在' }, 409);
  }

  const [item] = await db.insert(schema.categories).values(parsed.data).returning();

  const user = c.get('user');
  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'category.create',
    outcome: 'success',
    resourceType: 'category',
    resourceId: item.id,
    service: 'product-catalog',
    metadata: { code: item.code, name: item.name },
  });

  return c.json(item, 201);
});

// PATCH /categories/:id
categories.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.query.categories.findFirst({
    where: eq(schema.categories.id, id),
  });
  if (!existing) return c.json({ error: '分類不存在' }, 404);

  const [updated] = await db
    .update(schema.categories)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.categories.id, id))
    .returning();

  const user = c.get('user');
  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'category.update',
    outcome: 'success',
    resourceType: 'category',
    resourceId: id,
    service: 'product-catalog',
    metadata: parsed.data,
  });

  return c.json(updated);
});

// DELETE /categories/:id
categories.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.categories.findFirst({
    where: eq(schema.categories.id, id),
  });
  if (!existing) return c.json({ error: '分類不存在' }, 404);

  await db.delete(schema.categories).where(eq(schema.categories.id, id));

  const user = c.get('user');
  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'category.delete',
    outcome: 'success',
    resourceType: 'category',
    resourceId: id,
    service: 'product-catalog',
  });

  return c.json({ ok: true });
});

export { categories };
