import type { Context, Next } from 'hono';
import { config } from './config.js';

/**
 * API Key 認證中介層
 * 驗證方式：呼叫 hayku-identity 的 /auth/me 用 API Key 確認身份
 * 如果 identity service 不可用，fallback 到信任模式（僅限開發環境）
 */
export async function apiKeyAuth(c: Context, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: '未提供認證 Token' }, 401);
  }

  const token = header.slice(7);

  // 嘗試向 hayku-identity 驗證
  try {
    const res = await fetch(`${config.identityServiceUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const user = await res.json();
      c.set('authUser', { id: user.id, email: user.email });
      await next();
      return;
    }

    // Identity service 回拒 — 非開發環境直接 401
    if (process.env.NODE_ENV === 'production') {
      return c.json({ error: '認證失敗' }, 401);
    }

    // 開發模式 fallback
    c.set('authUser', { id: 'dev-service', email: 'dev@hayku.local' });
    await next();
  } catch {
    // Identity service 不可用
    if (process.env.NODE_ENV !== 'production') {
      c.set('authUser', { id: 'dev-service', email: 'dev@hayku.local' });
      await next();
    } else {
      return c.json({ error: '認證服務不可用' }, 503);
    }
  }
}
