import { pgTable, uuid, varchar, text, boolean, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';

// ============================================================
// 組織 (Organization)
// ============================================================
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 部門 (Department) — 屬於組織，支援樹狀層級
// ============================================================
export const departments = pgTable('departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): any => departments.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 使用者 (User)
// ============================================================
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),           // nullable：外部 IdP 使用者無密碼
  provider: varchar('provider', { length: 50 }).notNull().default('local'), // 'local' | 'google' | 'ldap'
  displayName: varchar('display_name', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 組織成員 (OrgMember) — 使用者和組織的多對多關聯
// ============================================================
export const orgMembers = pgTable('org_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('org_members_user_id_idx').on(table.userId),
  index('org_members_org_id_idx').on(table.orgId),
]);

// ============================================================
// 角色 (Role) — 屬於組織
// ============================================================
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 權限 (Permission) — 全域定義
// ============================================================
export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  resource: varchar('resource', { length: 255 }).notNull(),  // e.g. "document", "user", "report"
  action: varchar('action', { length: 255 }).notNull(),      // e.g. "read", "write", "delete", "admin"
  description: text('description'),
});

// ============================================================
// 角色-權限 關聯 (Role ↔ Permission)
// ============================================================
export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionId] }),
]);

// ============================================================
// 成員-角色 關聯 (OrgMember ↔ Role)
// ============================================================
export const memberRoles = pgTable('member_roles', {
  memberId: uuid('member_id').notNull().references(() => orgMembers.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.memberId, table.roleId] }),
  index('member_roles_member_id_idx').on(table.memberId),
]);

// ============================================================
// Refresh Token — 用於換發 access token
// ============================================================
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('refresh_tokens_user_id_idx').on(table.userId),
]);

// ============================================================
// 密碼重設 Token
// ============================================================
export const passwordResets = pgTable('password_resets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('password_resets_user_id_idx').on(table.userId),
]);

// ============================================================
// API Key — 服務間認證
// ============================================================
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),  // 前綴用於識別，如 "hk_a1b2c3d4"
  keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),
  scopes: text('scopes'),  // JSON array of permission scopes, null = full access
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('api_keys_user_id_idx').on(table.userId),
]);

// ============================================================
// 登入事件 (Login Event) — 登入日誌與安全告警
// ============================================================
export const loginEvents = pgTable('login_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  email: varchar('email', { length: 255 }).notNull(),
  outcome: varchar('outcome', { length: 20 }).notNull(), // 'success' | 'failure' | 'blocked'
  reason: varchar('reason', { length: 255 }),             // e.g. 'invalid_password', 'account_disabled', 'too_many_attempts'
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('login_events_user_id_idx').on(table.userId),
  index('login_events_email_idx').on(table.email),
  index('login_events_created_at_idx').on(table.createdAt),
]);

// ============================================================
// OAuth Clients — 已登錄的 OIDC 客戶端應用
// ============================================================
export const oauthClients = pgTable('oauth_clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: varchar('client_id', { length: 255 }).notNull().unique(),
  clientSecret: varchar('client_secret', { length: 255 }),            // null = public client（PKCE only）
  name: varchar('name', { length: 255 }).notNull(),
  redirectUris: text('redirect_uris').notNull(),                      // JSON array
  scopes: text('scopes').notNull().default('["openid","profile","email"]'), // JSON array
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// OAuth Authorization Codes — 短效授權碼（5 分鐘）
// ============================================================
export const oauthCodes = pgTable('oauth_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 255 }).notNull().unique(),
  clientId: varchar('client_id', { length: 255 }).notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  scope: text('scope').notNull(),
  codeChallenge: varchar('code_challenge', { length: 255 }),          // PKCE
  codeChallengeMethod: varchar('code_challenge_method', { length: 10 }), // 'S256'
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('oauth_codes_client_id_idx').on(table.clientId),
]);

// ============================================================
// Identity Sessions — 瀏覽器 session（SSO cookie 依據）
// ============================================================
export const identitySessions = pgTable('identity_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionToken: varchar('session_token', { length: 255 }).notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('identity_sessions_user_id_idx').on(table.userId),
]);

// ============================================================
// Type exports
// ============================================================
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type OrgMember = typeof orgMembers.$inferSelect;
export type NewOrgMember = typeof orgMembers.$inferInsert;

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

export type LoginEvent = typeof loginEvents.$inferSelect;
export type NewLoginEvent = typeof loginEvents.$inferInsert;
