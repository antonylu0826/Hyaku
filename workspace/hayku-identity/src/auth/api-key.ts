import { eq, and, isNull, or, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { generateToken, hashToken } from './token-utils.js';

const API_KEY_PREFIX = 'hk_';

function generateApiKey(): { key: string; prefix: string } {
  const raw = generateToken(32);
  const prefix = API_KEY_PREFIX + raw.slice(0, 8);
  const key = prefix + '_' + raw;
  return { key, prefix };
}

export interface CreateApiKeyOptions {
  userId: string;
  name: string;
  scopes?: string[];
  expiresInDays?: number;
}

/** 建立 API Key，回傳明文 key（只顯示一次） */
export async function createApiKey(opts: CreateApiKeyOptions): Promise<{
  id: string;
  key: string;
  name: string;
  keyPrefix: string;
  expiresAt: Date | null;
}> {
  const { key, prefix } = generateApiKey();

  const expiresAt = opts.expiresInDays
    ? new Date(Date.now() + opts.expiresInDays * 86400000)
    : null;

  const [record] = await db.insert(schema.apiKeys).values({
    userId: opts.userId,
    name: opts.name,
    keyPrefix: prefix,
    keyHash: hashToken(key),
    scopes: opts.scopes ? JSON.stringify(opts.scopes) : null,
    expiresAt,
  }).returning({
    id: schema.apiKeys.id,
    keyPrefix: schema.apiKeys.keyPrefix,
    name: schema.apiKeys.name,
    expiresAt: schema.apiKeys.expiresAt,
  });

  return { ...record, key };
}

/** 驗證 API Key，回傳 userId 和 scopes 或 null */
export async function verifyApiKey(key: string): Promise<{
  userId: string;
  scopes: string[] | null;
} | null> {
  const record = await db.query.apiKeys.findFirst({
    where: and(
      eq(schema.apiKeys.keyHash, hashToken(key)),
      isNull(schema.apiKeys.revokedAt),
      or(
        isNull(schema.apiKeys.expiresAt),
        gt(schema.apiKeys.expiresAt, new Date()),
      ),
    ),
  });

  if (!record) return null;

  // 更新 lastUsedAt（背景執行，錯誤靜默處理）
  db.update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, record.id))
    .catch(() => {});

  const scopes = record.scopes ? JSON.parse(record.scopes as string) : null;
  return { userId: record.userId, scopes };
}

/** 列出使用者的所有 API Key（不含 hash） */
export async function listApiKeys(userId: string) {
  return db.query.apiKeys.findMany({
    where: and(
      eq(schema.apiKeys.userId, userId),
      isNull(schema.apiKeys.revokedAt),
    ),
    columns: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
}

/** 撤銷 API Key */
export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  const result = await db.update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(schema.apiKeys.id, keyId),
      eq(schema.apiKeys.userId, userId),
      isNull(schema.apiKeys.revokedAt),
    ))
    .returning({ id: schema.apiKeys.id });
  return result.length > 0;
}
