import type { Context, Next } from 'hono';
import { verifyToken, type JwtPayload } from './jwt.js';
import { verifyApiKey } from './api-key.js';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload;
    authMethod: 'jwt' | 'apikey';
    apiKeyScopes: string[] | null;
  }
}

/**
 * 統一認證中介層：支援 JWT 和 API Key 兩種方式
 * - Bearer eyJ... → JWT
 * - Bearer hk_...  → API Key
 */
export async function authMiddleware(c: Context, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: '未提供認證 Token' }, 401);
  }

  const token = header.slice(7);

  // API Key 認證
  if (token.startsWith('hk_')) {
    const result = await verifyApiKey(token);
    if (!result) {
      return c.json({ error: 'API Key 無效或已過期' }, 401);
    }

    // 查詢使用者資訊填入 context
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, result.userId),
    });

    if (!user || !user.isActive) {
      return c.json({ error: '使用者不存在或已停用' }, 401);
    }

    c.set('user', {
      sub: user.id,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
    });
    c.set('authMethod', 'apikey');
    c.set('apiKeyScopes', result.scopes);
    await next();
    return;
  }

  // JWT 認證
  try {
    const payload = verifyToken(token);
    c.set('user', payload);
    c.set('authMethod', 'jwt');
    c.set('apiKeyScopes', null);
    await next();
  } catch {
    return c.json({ error: 'Token 無效或已過期' }, 401);
  }
}

export async function superAdminMiddleware(c: Context, next: Next) {
  const user = c.get('user');
  if (!user?.isSuperAdmin) {
    return c.json({ error: '需要超級管理員權限' }, 403);
  }
  await next();
}
