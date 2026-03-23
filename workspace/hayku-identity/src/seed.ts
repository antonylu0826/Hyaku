import { eq } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { hashPassword } from './auth/password.js';

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
