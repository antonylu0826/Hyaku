import { Hono } from 'hono';
import { eq, and, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../auth.js';
import { createPrSchema, updatePrSchema, approvePrSchema, listQuerySchema } from '../validators.js';
import { audit } from '../audit.js';
import { generatePrNumber } from '../lib/pr-number.js';

const prs = new Hono();

prs.use('/*', authMiddleware);

// GET /purchase-requests
prs.get('/', async (c) => {
  const query = listQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: '查詢參數錯誤', details: query.error.flatten() }, 400);
  }

  const { page, limit, status, requesterId } = query.data;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (status) {
    conditions.push(eq(schema.purchaseRequests.status, status as any));
  }
  if (requesterId) {
    conditions.push(eq(schema.purchaseRequests.requesterId, requesterId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.query.purchaseRequests.findMany({
    where,
    limit,
    offset,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return c.json({ items, page, limit });
});

// GET /purchase-requests/:id
prs.get('/:id', async (c) => {
  const id = c.req.param('id');
  const item = await db.query.purchaseRequests.findFirst({
    where: eq(schema.purchaseRequests.id, id),
    with: { items: true },
  });
  if (!item) return c.json({ error: '採購申請單不存在' }, 404);
  return c.json(item);
});

// POST /purchase-requests
prs.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createPrSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const user = c.get('user');
  const prNumber = generatePrNumber();
  const { items, ...prData } = parsed.data;

  const [pr] = await db.insert(schema.purchaseRequests).values({
    ...prData,
    prNumber,
    requesterId: user.sub,
    requesterEmail: user.email,
    requiredDate: prData.requiredDate ? new Date(prData.requiredDate) : undefined,
  }).returning();

  // 插入明細
  if (items.length > 0) {
    await db.insert(schema.purchaseRequestItems).values(
      items.map(item => ({
        ...item,
        prId: pr.id,
      }))
    );
  }

  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'purchase_request.create',
    outcome: 'success',
    resourceType: 'purchase_request',
    resourceId: pr.id,
    service: 'procurement',
    metadata: { prNumber, itemCount: items.length },
  });

  return c.json({ ...pr, items }, 201);
});

// PATCH /purchase-requests/:id
prs.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.purchaseRequests.findFirst({
    where: eq(schema.purchaseRequests.id, id),
  });
  if (!existing) return c.json({ error: '採購申請單不存在' }, 404);
  if (existing.status !== 'draft') {
    return c.json({ error: '只有草稿狀態的申請單可以修改' }, 409);
  }

  const body = await c.req.json();
  const parsed = updatePrSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const [updated] = await db
    .update(schema.purchaseRequests)
    .set({
      ...parsed.data,
      requiredDate: parsed.data.requiredDate ? new Date(parsed.data.requiredDate) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(schema.purchaseRequests.id, id))
    .returning();

  return c.json(updated);
});

// POST /purchase-requests/:id/submit — 提交審核
prs.post('/:id/submit', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.purchaseRequests.findFirst({
    where: eq(schema.purchaseRequests.id, id),
  });
  if (!existing) return c.json({ error: '採購申請單不存在' }, 404);
  if (existing.status !== 'draft') {
    return c.json({ error: '只有草稿狀態的申請單可以提交' }, 409);
  }

  const user = c.get('user');
  if (existing.requesterId !== user.sub) {
    return c.json({ error: '只有申請人可以提交申請單' }, 403);
  }

  const [updated] = await db
    .update(schema.purchaseRequests)
    .set({ status: 'submitted', updatedAt: new Date() })
    .where(eq(schema.purchaseRequests.id, id))
    .returning();

  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'purchase_request.submit',
    outcome: 'success',
    resourceType: 'purchase_request',
    resourceId: id,
    service: 'procurement',
    metadata: { prNumber: existing.prNumber },
  });

  return c.json(updated);
});

// POST /purchase-requests/:id/review — 核准或退回
prs.post('/:id/review', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.purchaseRequests.findFirst({
    where: eq(schema.purchaseRequests.id, id),
  });
  if (!existing) return c.json({ error: '採購申請單不存在' }, 404);
  if (existing.status !== 'submitted') {
    return c.json({ error: '只有已提交的申請單可以審核' }, 409);
  }

  const body = await c.req.json();
  const parsed = approvePrSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const user = c.get('user');
  const newStatus = parsed.data.action === 'approve' ? 'approved' : 'rejected';

  const [updated] = await db
    .update(schema.purchaseRequests)
    .set({
      status: newStatus,
      approverId: user.sub,
      approvedAt: new Date(),
      rejectionReason: parsed.data.action === 'reject' ? (parsed.data.reason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.purchaseRequests.id, id))
    .returning();

  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: `purchase_request.${parsed.data.action}`,
    outcome: 'success',
    resourceType: 'purchase_request',
    resourceId: id,
    service: 'procurement',
    metadata: { prNumber: existing.prNumber, reason: parsed.data.reason },
  });

  return c.json(updated);
});

// POST /purchase-requests/:id/cancel
prs.post('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.purchaseRequests.findFirst({
    where: eq(schema.purchaseRequests.id, id),
  });
  if (!existing) return c.json({ error: '採購申請單不存在' }, 404);
  if (['cancelled', 'ordered'].includes(existing.status)) {
    return c.json({ error: '此申請單無法取消' }, 409);
  }

  const user = c.get('user');
  const [updated] = await db
    .update(schema.purchaseRequests)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(schema.purchaseRequests.id, id))
    .returning();

  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'purchase_request.cancel',
    outcome: 'success',
    resourceType: 'purchase_request',
    resourceId: id,
    service: 'procurement',
    metadata: { prNumber: existing.prNumber },
  });

  return c.json(updated);
});

export { prs };
