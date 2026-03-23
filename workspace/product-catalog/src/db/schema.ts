import { pgTable, uuid, varchar, text, boolean, timestamp, numeric, index } from 'drizzle-orm/pg-core';

// ============================================================
// 品項分類 (Category)
// ============================================================
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  parentId: uuid('parent_id').references((): any => categories.id, { onDelete: 'set null' }),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('categories_code_idx').on(table.code),
  index('categories_parent_id_idx').on(table.parentId),
]);

// ============================================================
// 計量單位 (Unit of Measure)
// ============================================================
export const units = pgTable('units', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),      // e.g. 箱、個、公斤
  code: varchar('code', { length: 20 }).notNull().unique(), // e.g. BOX, PCS, KG
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 品項 (Product)
// ============================================================
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 100 }).notNull().unique(),  // SKU / 品號
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),
  description: text('description'),
  specification: text('specification'),                        // 規格說明
  referencePrice: numeric('reference_price', { precision: 14, scale: 4 }),  // 參考單價
  currency: varchar('currency', { length: 10 }).notNull().default('TWD'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').notNull(),                    // user id from identity service
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('products_code_idx').on(table.code),
  index('products_category_id_idx').on(table.categoryId),
  index('products_is_active_idx').on(table.isActive),
]);

// ============================================================
// Type exports
// ============================================================
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
