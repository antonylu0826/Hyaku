import { Hono } from 'hono';
import { eq, and, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../auth.js';
import { createPoSchema, updatePoStatusSchema, receiveItemsSchema, listQuerySchema } from '../validators.js';
import { audit } from '../audit.js';
import { generatePoNumber } from '../lib/pr-number.js';

const pos = new Hono();

pos.use('/*', authMiddleware);

// GET /purchase-orders
pos.get('/', async (c) => {
  const query = listQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: '查詢參數錯誤', details: query.error.flatten() }, 400);
  }

  const { page, limit, status, supplierId } = query.data;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (status) {
    conditions.push(eq(schema.purchaseOrders.status, status as any));
  }
  if (supplierId) {
    conditions.push(eq(schema.purchaseOrders.supplierId, supplierId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.query.purchaseOrders.findMany({
    where,
    limit,
    offset,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return c.json({ items, page, limit });
});

// GET /purchase-orders/:id
pos.get('/:id', async (c) => {
  const id = c.req.param('id');
  const item = await db.query.purchaseOrders.findFirst({
    where: eq(schema.purchaseOrders.id, id),
    with: { items: true },
  });
  if (!item) return c.json({ error: '採購單不存在' }, 404);
  return c.json(item);
});

// POST /purchase-orders
pos.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createPoSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const user = c.get('user');
  const poNumber = generatePoNumber();
  const { items, ...poData } = parsed.data;

  // 計算總金額
  const totalAmount = items
    .reduce((sum, item) => {
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unitPrice);
      return sum + qty * price;
    }, 0)
    .toFixed(4);

  const [po] = await db.insert(schema.purchaseOrders).values({
    ...poData,
    poNumber,
    totalAmount,
    createdBy: user.sub,
    expectedDeliveryDate: poData.expectedDeliveryDate
      ? new Date(poData.expectedDeliveryDate)
      : undefined,
  }).returning();

  // 插入明細（含計算 totalPrice）
  if (items.length > 0) {
    await db.insert(schema.purchaseOrderItems).values(
      items.map(item => ({
        ...item,
        poId: po.id,
        totalPrice: (parseFloat(item.quantity) * parseFloat(item.unitPrice)).toFixed(4),
      }))
    );
  }

  // 若有關聯 PR，更新狀態為 ordered
  if (poData.prId) {
    await db
      .update(schema.purchaseRequests)
      .set({ status: 'ordered', updatedAt: new Date() })
      .where(eq(schema.purchaseRequests.id, poData.prId));
  }

  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'purchase_order.create',
    outcome: 'success',
    resourceType: 'purchase_order',
    resourceId: po.id,
    service: 'procurement',
    metadata: { poNumber, supplierName: po.supplierName, totalAmount },
  });

  return c.json({ ...po, items }, 201);
});

// PATCH /purchase-orders/:id/status — 更新採購單狀態
pos.patch('/:id/status', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.purchaseOrders.findFirst({
    where: eq(schema.purchaseOrders.id, id),
  });
  if (!existing) return c.json({ error: '採購單不存在' }, 404);

  const body = await c.req.json();
  const parsed = updatePoStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const user = c.get('user');
  const [updated] = await db
    .update(schema.purchaseOrders)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(schema.purchaseOrders.id, id))
    .returning();

  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'purchase_order.status_change',
    outcome: 'success',
    resourceType: 'purchase_order',
    resourceId: id,
    service: 'procurement',
    metadata: { poNumber: existing.poNumber, from: existing.status, to: parsed.data.status },
  });

  return c.json(updated);
});

// POST /purchase-orders/:id/receive — 記錄到貨數量
pos.post('/:id/receive', async (c) => {
  const id = c.req.param('id');
  const existing = await db.query.purchaseOrders.findFirst({
    where: eq(schema.purchaseOrders.id, id),
    with: { items: true },
  });
  if (!existing) return c.json({ error: '採購單不存在' }, 404);
  if (!['sent', 'confirmed', 'partial'].includes(existing.status)) {
    return c.json({ error: '此採購單狀態不允許記錄到貨' }, 409);
  }

  const body = await c.req.json();
  const parsed = receiveItemsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  // 更新每個明細的到貨數量
  for (const recv of parsed.data.items) {
    await db
      .update(schema.purchaseOrderItems)
      .set({ receivedQuantity: recv.receivedQuantity })
      .where(
        and(
          eq(schema.purchaseOrderItems.id, recv.itemId),
          eq(schema.purchaseOrderItems.poId, id),
        )
      );
  }

  // 重新讀取明細，判斷是否全部到貨
  const updatedItems = await db.query.purchaseOrderItems.findMany({
    where: eq(schema.purchaseOrderItems.poId, id),
  });

  const allReceived = updatedItems.every(
    item => parseFloat(item.receivedQuantity ?? '0') >= parseFloat(item.quantity)
  );
  const anyReceived = updatedItems.some(
    item => parseFloat(item.receivedQuantity ?? '0') > 0
  );

  const newStatus = allReceived ? 'received' : anyReceived ? 'partial' : existing.status;

  const [updated] = await db
    .update(schema.purchaseOrders)
    .set({ status: newStatus as any, updatedAt: new Date() })
    .where(eq(schema.purchaseOrders.id, id))
    .returning();

  const user = c.get('user');
  audit.log({
    actorId: user.sub,
    actorType: 'user',
    actorEmail: user.email,
    action: 'purchase_order.receive',
    outcome: 'success',
    resourceType: 'purchase_order',
    resourceId: id,
    service: 'procurement',
    metadata: { poNumber: existing.poNumber, newStatus },
  });

  return c.json(updated);
});

export { pos };
