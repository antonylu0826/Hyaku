import { eq, and, isNull, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { generateToken, hashToken } from './token-utils.js';

/** 建立 refresh token 並存入資料庫，回傳明文 token（只給用戶端一次） */
export async function createRefreshToken(userId: string): Promise<string> {
  const token = generateToken(48);
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.refreshTokenExpiresInDays);

  await db.insert(schema.refreshTokens).values({ userId, tokenHash, expiresAt });
  return token;
}

/** 驗證 refresh token，回傳 userId 或 null */
export async function verifyRefreshToken(token: string): Promise<string | null> {
  const record = await db.query.refreshTokens.findFirst({
    where: and(
      eq(schema.refreshTokens.tokenHash, hashToken(token)),
      isNull(schema.refreshTokens.revokedAt),
      gt(schema.refreshTokens.expiresAt, new Date()),
    ),
  });
  return record?.userId ?? null;
}

/** 撤銷指定 refresh token */
export async function revokeRefreshToken(token: string): Promise<boolean> {
  const result = await db
    .update(schema.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(schema.refreshTokens.tokenHash, hashToken(token)),
      isNull(schema.refreshTokens.revokedAt),
    ))
    .returning({ id: schema.refreshTokens.id });
  return result.length > 0;
}

/** 撤銷某使用者的所有 refresh token（密碼變更時用） */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const result = await db
    .update(schema.refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(schema.refreshTokens.userId, userId),
      isNull(schema.refreshTokens.revokedAt),
    ))
    .returning({ id: schema.refreshTokens.id });
  return result.length;
}
