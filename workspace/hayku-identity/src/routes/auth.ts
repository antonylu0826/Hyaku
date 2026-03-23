import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  hashPassword, verifyPassword, signToken, authMiddleware,
  createRefreshToken, verifyRefreshToken, revokeRefreshToken,
  createPasswordReset, executePasswordReset,
} from '../auth/index.js';
import { registerSchema, loginSchema, requestResetSchema, executeResetSchema } from '../validators.js';
import { config } from '../config.js';

const auth = new Hono();

// POST /auth/register
auth.post('/register', async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const { email, password, displayName } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  if (existing) {
    return c.json({ error: '此 Email 已被註冊' }, 409);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(schema.users).values({
    email,
    passwordHash,
    displayName,
  }).returning({
    id: schema.users.id,
    email: schema.users.email,
    displayName: schema.users.displayName,
  });

  const accessToken = signToken({
    sub: user.id,
    email: user.email,
    isSuperAdmin: false,
  });
  const refreshToken = await createRefreshToken(user.id);

  return c.json({ user, token: accessToken, refreshToken }, 201);
});

// POST /auth/login
auth.post('/login', async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗' }, 400);
  }

  const { email, password } = parsed.data;

  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (!user || !user.isActive) {
    return c.json({ error: 'Email 或密碼錯誤' }, 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Email 或密碼錯誤' }, 401);
  }

  const accessToken = signToken({
    sub: user.id,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
  });
  const refreshToken = await createRefreshToken(user.id);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    token: accessToken,
    refreshToken,
  });
});

// POST /auth/refresh — 用 refresh token 換新的 access + refresh token
auth.post('/refresh', async (c) => {
  const body = await c.req.json();
  const { refreshToken } = body;

  if (!refreshToken || typeof refreshToken !== 'string') {
    return c.json({ error: '缺少 refreshToken' }, 400);
  }

  const userId = await verifyRefreshToken(refreshToken);
  if (!userId) {
    return c.json({ error: 'Refresh token 無效或已過期' }, 401);
  }

  // 撤銷舊 token（rotation：每次 refresh 都換新的）
  await revokeRefreshToken(refreshToken);

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user || !user.isActive) {
    return c.json({ error: '使用者不存在或已停用' }, 401);
  }

  const newAccessToken = signToken({
    sub: user.id,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
  });
  const newRefreshToken = await createRefreshToken(user.id);

  return c.json({
    token: newAccessToken,
    refreshToken: newRefreshToken,
  });
});

// POST /auth/logout — 撤銷 refresh token
auth.post('/logout', async (c) => {
  const body = await c.req.json();
  const { refreshToken } = body;

  if (!refreshToken || typeof refreshToken !== 'string') {
    return c.json({ error: '缺少 refreshToken' }, 400);
  }

  await revokeRefreshToken(refreshToken);
  return c.json({ message: '已登出' });
});

// POST /auth/request-reset — 請求密碼重設（產生 reset token）
auth.post('/request-reset', async (c) => {
  const body = await c.req.json();
  const parsed = requestResetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗' }, 400);
  }

  const result = await createPasswordReset(parsed.data.email);

  // 不論使用者是否存在都回傳成功（防止帳號列舉攻擊）
  // 實際系統中 result.token 會透過 email 發送
  if (result && config.isDev) {
    return c.json({ message: '密碼重設連結已發送', _devToken: result.token });
  }

  return c.json({ message: '密碼重設連結已發送' });
});

// POST /auth/reset-password — 用 reset token 設定新密碼
auth.post('/reset-password', async (c) => {
  const body = await c.req.json();
  const parsed = executeResetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const success = await executePasswordReset(parsed.data.token, parsed.data.newPassword);

  if (!success) {
    return c.json({ error: '重設連結無效或已過期' }, 400);
  }

  return c.json({ message: '密碼已重設，請重新登入' });
});

// GET /auth/me — 需要 token
auth.get('/me', authMiddleware, async (c) => {
  const payload = c.get('user');
  if (!payload) {
    return c.json({ error: '未認證' }, 401);
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, payload.sub),
  });

  if (!user) {
    return c.json({ error: '使用者不存在' }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isSuperAdmin: user.isSuperAdmin,
    createdAt: user.createdAt,
  });
});

export { auth };
