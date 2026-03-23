import { Hono } from 'hono';
import { eq, ilike, and, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../auth.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  createContactSchema,
  updateContactSchema,
  listQuerySchema,
} from '../validators.js';
import { audit } from '../audit.js';

const suppliers = new Hono();

suppliers.use('/*', authMiddleware);

// GET /suppliers
suppliers.get('/', async (c) => {
  const query = listQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: '查詢參數錯誤', details: query.error.flatten() }, 400);
  }

  const { page, limit, search, isActive } = query.data;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (search) {
    conditions.push(ilike(schema.suppliers.name, `%${search}%`));
  }
  if (isActive !== undefined) {
    conditions.push(eq(schema.suppliers.isActive, isActive === 'true'));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.query.suppliers.findMany({
    where,
    limit,
    offset,
    orderBy: (t, { asc }) => [asc(t.code)],
  });

  return c.json({ items, page, limit });
});

// GET /suppliers/:id
suppliers.get('/:id', async (c) => {
  const id = c.req.param('id');
  const item = await db.query.suppliers.findFirst({
    where: eq(schema.suppliers.id, id),
    with: { contacts: true },
  });
  if (!item) return c.json({ error: '供應商不存在' }, 404);
  return c.json(item);
});

// POST /suppliers
suppliers.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createSupplierSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.query.suppliers.findFirst({
    where: eq(schema.suppliers.code, parsed.data.code),
  });
  if (existing) {
    return c.json({ error: '此供應商代碼已存在' }, 409);
  }

  const user = c.get('user');
  const [item] = await db.insert(schema.suppliers).values({
    ...parsed.data,
    createdBy: user.sub,
  }).returning();

  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'supplier.create',
    outcome: 'success',
    resourceType: 'supplier',
    resourceId: item.id,
    service: 'supplier',
    metadata: { code: item.code, name: item.name },
  });

  return c.json(item, 201);
});

// PATCH /suppliers/:id
suppliers.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateSupplierSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.query.suppliers.findFirst({
    where: eq(schema.suppliers.id, id),
  });
  if (!existing) return c.json({ error: '供應商不存在' }, 404);

  const [updated] = await db
    .update(schema.suppliers)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.suppliers.id, id))
    .returning();

  const user = c.get('user');
  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'supplier.update',
    outcome: 'success',
    resourceType: 'supplier',
    resourceId: id,
    service: 'supplier',
    metadata: parsed.data,
  });

  return c.json(updated);
});

// DELETE /suppliers/:id (軟刪除)
suppliers.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.suppliers.findFirst({
    where: eq(schema.suppliers.id, id),
  });
  if (!existing) return c.json({ error: '供應商不存在' }, 404);

  const [updated] = await db
    .update(schema.suppliers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.suppliers.id, id))
    .returning();

  const user = c.get('user');
  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'supplier.deactivate',
    outcome: 'success',
    resourceType: 'supplier',
    resourceId: id,
    service: 'supplier',
  });

  return c.json(updated);
});

// ─── 聯絡人 ──────────────────────────────────────────────────

// GET /suppliers/:id/contacts
suppliers.get('/:id/contacts', async (c) => {
  const supplierId = c.req.param('id');
  const existing = await db.query.suppliers.findFirst({
    where: eq(schema.suppliers.id, supplierId),
  });
  if (!existing) return c.json({ error: '供應商不存在' }, 404);

  const contacts = await db.query.supplierContacts.findMany({
    where: eq(schema.supplierContacts.supplierId, supplierId),
    orderBy: (t, { desc }) => [desc(t.isPrimary)],
  });
  return c.json(contacts);
});

// POST /suppliers/:id/contacts
suppliers.post('/:id/contacts', async (c) => {
  const supplierId = c.req.param('id');
  const existing = await db.query.suppliers.findFirst({
    where: eq(schema.suppliers.id, supplierId),
  });
  if (!existing) return c.json({ error: '供應商不存在' }, 404);

  const body = await c.req.json();
  const parsed = createContactSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const [contact] = await db.insert(schema.supplierContacts).values({
    ...parsed.data,
    supplierId,
  }).returning();

  const user = c.get('user');
  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'supplier.contact.create',
    outcome: 'success',
    resourceType: 'supplier_contact',
    resourceId: contact.id,
    service: 'supplier',
    metadata: { supplierId },
  });

  return c.json(contact, 201);
});

// PATCH /suppliers/:supplierId/contacts/:contactId
suppliers.patch('/:supplierId/contacts/:contactId', async (c) => {
  const { supplierId, contactId } = c.req.param();
  const body = await c.req.json();
  const parsed = updateContactSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.query.supplierContacts.findFirst({
    where: eq(schema.supplierContacts.id, contactId),
  });
  if (!existing || existing.supplierId !== supplierId) {
    return c.json({ error: '聯絡人不存在' }, 404);
  }

  const [updated] = await db
    .update(schema.supplierContacts)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.supplierContacts.id, contactId))
    .returning();

  return c.json(updated);
});

// DELETE /suppliers/:supplierId/contacts/:contactId
suppliers.delete('/:supplierId/contacts/:contactId', async (c) => {
  const { supplierId, contactId } = c.req.param();
  const existing = await db.query.supplierContacts.findFirst({
    where: eq(schema.supplierContacts.id, contactId),
  });
  if (!existing || existing.supplierId !== supplierId) {
    return c.json({ error: '聯絡人不存在' }, 404);
  }

  await db.delete(schema.supplierContacts).where(eq(schema.supplierContacts.id, contactId));
  return c.json({ ok: true });
});

export { suppliers };
