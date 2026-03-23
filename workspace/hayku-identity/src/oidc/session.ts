import { randomBytes } from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';

export const SESSION_COOKIE = 'hayku_sid';

/** 建立 identity session，回傳 session token（存進 cookie） */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.oidcSessionHours * 60 * 60 * 1000);

  await db.insert(schema.identitySessions).values({ sessionToken: token, userId, expiresAt });
  return token;
}

/** 從 session token 取得 userId，session 不存在或過期回傳 null */
export async function getSessionUserId(token: string): Promise<string | null> {
  const [session] = await db
    .select({ userId: schema.identitySessions.userId })
    .from(schema.identitySessions)
    .where(
      and(
        eq(schema.identitySessions.sessionToken, token),
        gt(schema.identitySessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return session?.userId ?? null;
}

/** 銷毀指定 session（登出） */
export async function destroySession(token: string): Promise<void> {
  await db.delete(schema.identitySessions)
    .where(eq(schema.identitySessions.sessionToken, token));
}

/** 銷毀使用者的所有 session（強制登出所有裝置） */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.delete(schema.identitySessions)
    .where(eq(schema.identitySessions.userId, userId));
}
