import { Hono } from 'hono';
import { eq, ilike, and, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../auth.js';
import { createProductSchema, updateProductSchema, listQuerySchema } from '../validators.js';
import { audit } from '../audit.js';

const products = new Hono();

products.use('/*', authMiddleware);

// GET /products
products.get('/', async (c) => {
  const query = listQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: '查詢參數錯誤', details: query.error.flatten() }, 400);
  }

  const { page, limit, search, categoryId, isActive } = query.data;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (search) {
    conditions.push(ilike(schema.products.name, `%${search}%`));
  }
  if (categoryId) {
    conditions.push(eq(schema.products.categoryId, categoryId));
  }
  if (isActive !== undefined) {
    conditions.push(eq(schema.products.isActive, isActive === 'true'));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.query.products.findMany({
    where,
    with: {
      category: true,
      unit: true,
    },
    limit,
    offset,
    orderBy: (t, { asc }) => [asc(t.code)],
  });

  return c.json({ items, page, limit });
});

// GET /products/:id
products.get('/:id', async (c) => {
  const id = c.req.param('id');
  const item = await db.query.products.findFirst({
    where: eq(schema.products.id, id),
    with: {
      category: true,
      unit: true,
    },
  });
  if (!item) return c.json({ error: '品項不存在' }, 404);
  return c.json(item);
});

// POST /products
products.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.query.products.findFirst({
    where: eq(schema.products.code, parsed.data.code),
  });
  if (existing) {
    return c.json({ error: '此品號已存在' }, 409);
  }

  const user = c.get('user');
  const [item] = await db.insert(schema.products).values({
    ...parsed.data,
    createdBy: user.sub,
  }).returning();

  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'product.create',
    outcome: 'success',
    resourceType: 'product',
    resourceId: item.id,
    service: 'product-catalog',
    metadata: { code: item.code, name: item.name },
  });

  return c.json(item, 201);
});

// PATCH /products/:id
products.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.query.products.findFirst({
    where: eq(schema.products.id, id),
  });
  if (!existing) return c.json({ error: '品項不存在' }, 404);

  const [updated] = await db
    .update(schema.products)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.products.id, id))
    .returning();

  const user = c.get('user');
  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'product.update',
    outcome: 'success',
    resourceType: 'product',
    resourceId: id,
    service: 'product-catalog',
    metadata: parsed.data,
  });

  return c.json(updated);
});

// DELETE /products/:id (軟刪除 — 設為 inactive)
products.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.products.findFirst({
    where: eq(schema.products.id, id),
  });
  if (!existing) return c.json({ error: '品項不存在' }, 404);

  const [updated] = await db
    .update(schema.products)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.products.id, id))
    .returning();

  const user = c.get('user');
  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'product.deactivate',
    outcome: 'success',
    resourceType: 'product',
    resourceId: id,
    service: 'product-catalog',
  });

  return c.json(updated);
});

export { products };
