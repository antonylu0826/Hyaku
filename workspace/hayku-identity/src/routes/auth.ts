import { Hono } from 'hono';
import { eq, desc, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  hashPassword, verifyPassword, signToken, authMiddleware, superAdminMiddleware,
  createRefreshToken, verifyRefreshToken, revokeRefreshToken, revokeAllUserTokens,
  createPasswordReset, executePasswordReset,
} from '../auth/index.js';
import { registerSchema, loginSchema, requestResetSchema, executeResetSchema } from '../validators.js';
import { config } from '../config.js';

/** 記錄登入事件 */
async function logLoginEvent(opts: {
  userId?: string;
  email: string;
  outcome: 'success' | 'failure' | 'blocked';
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  await db.insert(schema.loginEvents).values({
    userId: opts.userId,
    email: opts.email,
    outcome: opts.outcome,
    reason: opts.reason,
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent,
  }).catch(() => {}); // 登入日誌寫入失敗不應影響登入流程
}

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
  const ipAddress = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip');
  const userAgent = c.req.header('user-agent');

  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (!user) {
    await logLoginEvent({ email, outcome: 'failure', reason: 'user_not_found', ipAddress, userAgent });
    return c.json({ error: 'Email 或密碼錯誤' }, 401);
  }

  if (!user.isActive) {
    await logLoginEvent({ userId: user.id, email, outcome: 'blocked', reason: 'account_disabled', ipAddress, userAgent });
    return c.json({ error: 'Email 或密碼錯誤' }, 401);
  }

  if (user.provider !== 'local' || !user.passwordHash) {
    await logLoginEvent({ userId: user.id, email, outcome: 'failure', reason: 'wrong_provider', ipAddress, userAgent });
    return c.json({ error: '此帳號需透過第三方登入' }, 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await logLoginEvent({ userId: user.id, email, outcome: 'failure', reason: 'invalid_password', ipAddress, userAgent });
    return c.json({ error: 'Email 或密碼錯誤' }, 401);
  }

  await logLoginEvent({ userId: user.id, email, outcome: 'success', ipAddress, userAgent });

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

// ─── 帳號管理（僅超級管理員） ─────────────────────

// PATCH /auth/users/:id/status — 啟用/停用帳號
auth.patch('/users/:id/status', authMiddleware, superAdminMiddleware, async (c) => {
  const userId = c.req.param('id')!;
  const body = await c.req.json();
  const { isActive } = body;

  if (typeof isActive !== 'boolean') {
    return c.json({ error: 'isActive 必須為布林值' }, 400);
  }

  const [updated] = await db.update(schema.users)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning({ id: schema.users.id, email: schema.users.email, isActive: schema.users.isActive });

  if (!updated) {
    return c.json({ error: '使用者不存在' }, 404);
  }

  // 停用帳號時撤銷所有 refresh token
  if (!isActive) {
    await revokeAllUserTokens(userId);
  }

  return c.json(updated);
});

// GET /auth/users — 列出所有使用者（僅超級管理員）
auth.get('/users', authMiddleware, superAdminMiddleware, async (c) => {
  const users = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    displayName: schema.users.displayName,
    isActive: schema.users.isActive,
    isSuperAdmin: schema.users.isSuperAdmin,
    createdAt: schema.users.createdAt,
  }).from(schema.users);

  return c.json(users);
});

// ─── 登入日誌（僅超級管理員） ─────────────────────

// GET /auth/login-events — 查詢登入日誌
auth.get('/login-events', authMiddleware, superAdminMiddleware, async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 500);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);
  const email = c.req.query('email');
  const outcome = c.req.query('outcome');

  const conditions = [];
  if (email) conditions.push(eq(schema.loginEvents.email, email));
  if (outcome) conditions.push(eq(schema.loginEvents.outcome, outcome));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const events = await db.select()
    .from(schema.loginEvents)
    .where(where)
    .orderBy(desc(schema.loginEvents.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ events, limit, offset });
});

export { auth };
