import {
  pgTable, uuid, varchar, text, boolean, timestamp, numeric, integer, index, pgEnum,
} from 'drizzle-orm/pg-core';

// ============================================================
// Enums
// ============================================================
export const prStatusEnum = pgEnum('pr_status', [
  'draft',       // 草稿
  'submitted',   // 已提交審核
  'approved',    // 已核准
  'rejected',    // 已退回
  'cancelled',   // 已取消
  'ordered',     // 已轉採購單
]);

export const poStatusEnum = pgEnum('po_status', [
  'draft',       // 草稿
  'sent',        // 已發送供應商
  'confirmed',   // 供應商確認
  'partial',     // 部分到貨
  'received',    // 全部到貨
  'cancelled',   // 已取消
]);

// ============================================================
// 採購申請單 (Purchase Request)
// ============================================================
export const purchaseRequests = pgTable('purchase_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  prNumber: varchar('pr_number', { length: 50 }).notNull().unique(),  // PR-20260323-001
  title: varchar('title', { length: 500 }).notNull(),
  status: prStatusEnum('status').notNull().default('draft'),
  requesterId: uuid('requester_id').notNull(),            // user id
  requesterEmail: varchar('requester_email', { length: 255 }).notNull(),
  departmentId: uuid('department_id'),                    // optional org department
  requiredDate: timestamp('required_date', { withTimezone: true }),
  notes: text('notes'),
  rejectionReason: text('rejection_reason'),
  approverId: uuid('approver_id'),                        // who approved/rejected
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('pr_number_idx').on(table.prNumber),
  index('pr_status_idx').on(table.status),
  index('pr_requester_idx').on(table.requesterId),
]);

// ============================================================
// 採購申請單明細 (Purchase Request Item)
// ============================================================
export const purchaseRequestItems = pgTable('purchase_request_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  prId: uuid('pr_id').notNull().references(() => purchaseRequests.id, { onDelete: 'cascade' }),
  lineNumber: integer('line_number').notNull(),            // 行號
  productId: uuid('product_id'),                          // 來自 product-catalog（可選，允許自由描述）
  productCode: varchar('product_code', { length: 100 }),
  productName: varchar('product_name', { length: 255 }).notNull(),
  specification: text('specification'),
  quantity: numeric('quantity', { precision: 14, scale: 4 }).notNull(),
  unit: varchar('unit', { length: 50 }),                  // 計量單位名稱
  estimatedPrice: numeric('estimated_price', { precision: 14, scale: 4 }),
  currency: varchar('currency', { length: 10 }).notNull().default('TWD'),
  notes: text('notes'),
}, (table) => [
  index('pr_items_pr_id_idx').on(table.prId),
]);

// ============================================================
// 採購單 (Purchase Order)
// ============================================================
export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  poNumber: varchar('po_number', { length: 50 }).notNull().unique(),  // PO-20260323-001
  prId: uuid('pr_id').references(() => purchaseRequests.id, { onDelete: 'set null' }),
  supplierId: uuid('supplier_id').notNull(),              // 來自 supplier service
  supplierName: varchar('supplier_name', { length: 255 }).notNull(),  // 快照，避免跨服務查詢
  supplierCode: varchar('supplier_code', { length: 50 }).notNull(),
  status: poStatusEnum('status').notNull().default('draft'),
  orderDate: timestamp('order_date', { withTimezone: true }).notNull().defaultNow(),
  expectedDeliveryDate: timestamp('expected_delivery_date', { withTimezone: true }),
  deliveryAddress: text('delivery_address'),
  paymentTerms: varchar('payment_terms', { length: 255 }),
  totalAmount: numeric('total_amount', { precision: 14, scale: 4 }).notNull().default('0'),
  currency: varchar('currency', { length: 10 }).notNull().default('TWD'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('po_number_idx').on(table.poNumber),
  index('po_status_idx').on(table.status),
  index('po_supplier_idx').on(table.supplierId),
]);

// ============================================================
// 採購單明細 (Purchase Order Item)
// ============================================================
export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  poId: uuid('po_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  prItemId: uuid('pr_item_id').references(() => purchaseRequestItems.id, { onDelete: 'set null' }),
  lineNumber: integer('line_number').notNull(),
  productId: uuid('product_id'),
  productCode: varchar('product_code', { length: 100 }),
  productName: varchar('product_name', { length: 255 }).notNull(),
  specification: text('specification'),
  quantity: numeric('quantity', { precision: 14, scale: 4 }).notNull(),
  unit: varchar('unit', { length: 50 }),
  unitPrice: numeric('unit_price', { precision: 14, scale: 4 }).notNull(),
  totalPrice: numeric('total_price', { precision: 14, scale: 4 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('TWD'),
  receivedQuantity: numeric('received_quantity', { precision: 14, scale: 4 }).notNull().default('0'),
  notes: text('notes'),
}, (table) => [
  index('po_items_po_id_idx').on(table.poId),
]);

// ============================================================
// Type exports
// ============================================================
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type NewPurchaseRequest = typeof purchaseRequests.$inferInsert;

export type PurchaseRequestItem = typeof purchaseRequestItems.$inferSelect;
export type NewPurchaseRequestItem = typeof purchaseRequestItems.$inferInsert;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type NewPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;
