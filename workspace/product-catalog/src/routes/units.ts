import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../auth.js';
import { createUnitSchema } from '../validators.js';

const units = new Hono();

units.use('/*', authMiddleware);

// GET /units
units.get('/', async (c) => {
  const items = await db.query.units.findMany({
    orderBy: (t, { asc }) => [asc(t.code)],
  });
  return c.json(items);
});

// POST /units
units.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createUnitSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.query.units.findFirst({
    where: eq(schema.units.code, parsed.data.code),
  });
  if (existing) {
    return c.json({ error: '此單位代碼已存在' }, 409);
  }

  const [item] = await db.insert(schema.units).values(parsed.data).returning();
  return c.json(item, 201);
});

// DELETE /units/:id
units.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.units.findFirst({
    where: eq(schema.units.id, id),
  });
  if (!existing) return c.json({ error: '單位不存在' }, 404);

  await db.delete(schema.units).where(eq(schema.units.id, id));
  return c.json({ ok: true });
});

export { units };
