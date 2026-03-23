import type { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

export interface JwtPayload {
  sub: string;
  email: string;
  isSuperAdmin?: boolean;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: '未提供認證 Token' }, 401);
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Token 無效或已過期' }, 401);
  }
}
