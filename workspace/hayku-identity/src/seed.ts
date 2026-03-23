import { eq } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { hashPassword } from './auth/password.js';
import { config } from './config.js';

/**
 * 檢查是否已有 superAdmin，若無則從環境變數建立預設管理員。
 *
 * 環境變數：
 *   DEFAULT_ADMIN_EMAIL    — 預設管理員信箱（預設 admin@hayku.local）
 *   DEFAULT_ADMIN_PASSWORD — 預設管理員密碼（預設 HaykuAdmin123!）
 *
 * 僅在 DB 中完全沒有 superAdmin 時才會建立。
 */
export async function ensureDefaultAdmin(): Promise<void> {
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.isSuperAdmin, true))
    .limit(1);

  if (existing) return;

  const email = process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@hayku.local';
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? 'HaykuAdmin123!';
  const displayName = process.env.DEFAULT_ADMIN_NAME ?? 'Hayku Admin';

  const passwordHash = await hashPassword(password);

  await db.insert(schema.users).values({
    email,
    passwordHash,
    displayName,
    isSuperAdmin: true,
    isActive: true,
  });

  console.log(`👤 已建立預設管理員: ${email}`);
  if (password === 'HaykuAdmin123!') {
    console.log(`⚠️  使用預設密碼，請儘速透過 API 修改密碼或設定 DEFAULT_ADMIN_PASSWORD 環境變數`);
  }
}

/**
 * 確保開發用 OAuth client 存在。
 * client_id: hayku-dev-client（public client，PKCE only）
 * redirect_uri: http://localhost:3000/callback（可透過 OIDC_DEV_REDIRECT_URI 覆蓋）
 */
export async function ensureDevOauthClient(): Promise<void> {
  if (!config.isDev) return;

  const clientId = 'hayku-dev-client';
  const existing = await db.query.oauthClients.findFirst({
    where: eq(schema.oauthClients.clientId, clientId),
  });
  if (existing) return;

  const redirectUri = process.env.OIDC_DEV_REDIRECT_URI ?? 'http://localhost:3000/callback';
  await db.insert(schema.oauthClients).values({
    clientId,
    clientSecret: null,
    name: 'Hayku Dev Client',
    redirectUris: JSON.stringify([redirectUri, 'http://localhost:3001/callback', 'http://localhost:4000/callback']),
    scopes: JSON.stringify(['openid', 'profile', 'email']),
  });

  console.log(`🔑 已建立開發用 OAuth client: ${clientId}（redirect: ${redirectUri}）`);
}
