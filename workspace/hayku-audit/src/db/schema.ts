import { pgTable, uuid, varchar, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

// ============================================================
// 審計事件 (AuditEvent) — 核心表，不可修改/刪除
// ============================================================
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),

  // 誰做的
  actorId: varchar('actor_id', { length: 255 }).notNull(),        // user ID or service name
  actorType: varchar('actor_type', { length: 50 }).notNull(),      // "user" | "service" | "system"
  actorEmail: varchar('actor_email', { length: 255 }),

  // 做了什麼
  action: varchar('action', { length: 255 }).notNull(),            // e.g. "user.login", "org.create", "role.assign"
  outcome: varchar('outcome', { length: 20 }).notNull().default('success'), // "success" | "failure" | "error"

  // 對什麼做的
  resourceType: varchar('resource_type', { length: 255 }),         // e.g. "user", "organization", "role"
  resourceId: varchar('resource_id', { length: 255 }),

  // 來自哪個服務
  service: varchar('service', { length: 255 }).notNull(),          // e.g. "hayku-identity", "hayku-audit"

  // 額外資訊
  metadata: jsonb('metadata'),                                      // 任意 JSON（變更前後、IP、user-agent 等）
  description: text('description'),                                 // 人類可讀描述

  // 時間（寫入後不可變）
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // 查詢索引
  idxActorId: index('idx_audit_actor_id').on(table.actorId),
  idxAction: index('idx_audit_action').on(table.action),
  idxResourceType: index('idx_audit_resource_type').on(table.resourceType),
  idxService: index('idx_audit_service').on(table.service),
  idxTimestamp: index('idx_audit_timestamp').on(table.timestamp),
}));

// ============================================================
// Type exports
// ============================================================
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
