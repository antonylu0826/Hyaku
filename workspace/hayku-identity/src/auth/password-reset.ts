import { eq, and, isNull, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hashPassword } from './password.js';
import { revokeAllUserTokens } from './refresh.js';
import { generateToken, hashToken } from './token-utils.js';

const RESET_TOKEN_EXPIRES_HOURS = 1;

/** 為指定 email 產生密碼重設 token，回傳 { token, userId } 或 null */
export async function createPasswordReset(email: string): Promise<{ token: string; userId: string } | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (!user || !user.isActive) return null;

  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + RESET_TOKEN_EXPIRES_HOURS);

  await db.insert(schema.passwordResets).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return { token, userId: user.id };
}

/** 用 reset token 重設密碼：驗證 → 更新密碼 → 標記已使用 → 撤銷 refresh tokens */
export async function executePasswordReset(token: string, newPassword: string): Promise<boolean> {
  const record = await db.query.passwordResets.findFirst({
    where: and(
      eq(schema.passwordResets.tokenHash, hashToken(token)),
      isNull(schema.passwordResets.usedAt),
      gt(schema.passwordResets.expiresAt, new Date()),
    ),
  });

  if (!record) return false;

  const passwordHash = await hashPassword(newPassword);

  await db.update(schema.users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(schema.users.id, record.userId));

  await db.update(schema.passwordResets)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResets.id, record.id));

  await revokeAllUserTokens(record.userId);
  return true;
}
