import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createEventSchema, batchCreateSchema, queryEventsSchema } from '../validators.js';

type EventInput = z.infer<typeof createEventSchema>;

const events = new Hono();

// 共用映射：將驗證後的事件資料轉換為 DB insert 格式
function toInsertValues(e: EventInput) {
  return {
    actorId: e.actorId,
    actorType: e.actorType,
    actorEmail: e.actorEmail,
    action: e.action,
    outcome: e.outcome,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    service: e.service,
    metadata: e.metadata,
    description: e.description,
    timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
  };
}

// POST /events — 寫入單筆審計事件
events.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const [event] = await db.insert(schema.auditEvents)
    .values(toInsertValues(parsed.data))
    .returning({
      id: schema.auditEvents.id,
      timestamp: schema.auditEvents.timestamp,
    });

  return c.json({ id: event.id, timestamp: event.timestamp }, 201);
});

// POST /events/batch — 批次寫入審計事件
events.post('/batch', async (c) => {
  const body = await c.req.json();
  const parsed = batchCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const values = parsed.data.events.map(toInsertValues);
  const result = await db.insert(schema.auditEvents).values(values).returning({
    id: schema.auditEvents.id,
  });

  return c.json({ inserted: result.length }, 201);
});

// GET /events — 查詢審計事件（篩選 + 分頁）
events.get('/', async (c) => {
  const query = queryEventsSchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: '查詢參數無效', details: query.error.flatten() }, 400);
  }

  const q = query.data;
  const conditions = [];

  if (q.actorId) conditions.push(eq(schema.auditEvents.actorId, q.actorId));
  if (q.action) conditions.push(eq(schema.auditEvents.action, q.action));
  if (q.resourceType) conditions.push(eq(schema.auditEvents.resourceType, q.resourceType));
  if (q.resourceId) conditions.push(eq(schema.auditEvents.resourceId, q.resourceId));
  if (q.service) conditions.push(eq(schema.auditEvents.service, q.service));
  if (q.outcome) conditions.push(eq(schema.auditEvents.outcome, q.outcome));
  if (q.from) conditions.push(gte(schema.auditEvents.timestamp, new Date(q.from)));
  if (q.to) conditions.push(lte(schema.auditEvents.timestamp, new Date(q.to)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [eventsResult, countResult] = await Promise.all([
    db.select()
      .from(schema.auditEvents)
      .where(where)
      .orderBy(desc(schema.auditEvents.timestamp))
      .limit(q.limit)
      .offset(q.offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(schema.auditEvents)
      .where(where),
  ]);

  return c.json({
    events: eventsResult,
    total: countResult[0].count,
    limit: q.limit,
    offset: q.offset,
  });
});

// GET /events/:id — 查詢單筆事件
events.get('/:id', async (c) => {
  const id = c.req.param('id');
  const event = await db.query.auditEvents.findFirst({
    where: eq(schema.auditEvents.id, id),
  });

  if (!event) {
    return c.json({ error: '事件不存在' }, 404);
  }

  return c.json(event);
});

export { events };
