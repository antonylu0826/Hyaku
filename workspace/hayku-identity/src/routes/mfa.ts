import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../auth/index.js';
import { generateTotpSecret, generateTotpUri, verifyTotp } from '../oidc/mfa.js';
import { config } from '../config.js';

const mfa = new Hono();
mfa.use('*', authMiddleware);

// GET /auth/mfa/status — 查詢目前 MFA 狀態
mfa.get('/status', async (c) => {
  const { sub } = c.get('user');
  const record = await db.query.mfaTotp.findFirst({ where: eq(schema.mfaTotp.userId, sub) });
  return c.json({
    enabled: !!(record?.verifiedAt),
    enrolled: !!record,
  });
});

// POST /auth/mfa/enroll — 開始 TOTP 註冊，回傳 secret 和 otpauth URI
mfa.post('/enroll', async (c) => {
  const { sub, email } = c.get('user');

  const existing = await db.query.mfaTotp.findFirst({ where: eq(schema.mfaTotp.userId, sub) });
  if (existing?.verifiedAt) {
    return c.json({ error: 'MFA 已啟用，請先停用再重新註冊' }, 409);
  }

  const secret = generateTotpSecret();
  const uri = generateTotpUri(secret, email, config.oidcIssuer);

  if (existing) {
    await db.update(schema.mfaTotp).set({ secret, verifiedAt: null }).where(eq(schema.mfaTotp.userId, sub));
  } else {
    await db.insert(schema.mfaTotp).values({ userId: sub, secret });
  }

  return c.json({ secret, uri, _note: '請用 Google Authenticator 或 Authy 掃描 URI，再呼叫 /auth/mfa/verify-enroll 確認' });
});

// POST /auth/mfa/verify-enroll — 確認 TOTP 碼並啟用 MFA
mfa.post('/verify-enroll', async (c) => {
  const { sub } = c.get('user');
  const body = await c.req.json();
  const code = String(body.code ?? '');

  const record = await db.query.mfaTotp.findFirst({ where: eq(schema.mfaTotp.userId, sub) });
  if (!record) return c.json({ error: '尚未開始 MFA 註冊' }, 400);
  if (record.verifiedAt) return c.json({ error: 'MFA 已啟用' }, 409);

  if (!verifyTotp(record.secret, code)) {
    return c.json({ error: '驗證碼錯誤，請確認時間同步' }, 401);
  }

  await db.update(schema.mfaTotp)
    .set({ verifiedAt: new Date() })
    .where(eq(schema.mfaTotp.userId, sub));

  return c.json({ message: 'MFA 已成功啟用，下次登入將需要驗證碼' });
});

// DELETE /auth/mfa — 停用 MFA
mfa.delete('/', async (c) => {
  const { sub } = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const code = String((body as Record<string, unknown>).code ?? '');

  const record = await db.query.mfaTotp.findFirst({ where: eq(schema.mfaTotp.userId, sub) });
  if (!record?.verifiedAt) return c.json({ error: 'MFA 未啟用' }, 400);

  if (!verifyTotp(record.secret, code)) {
    return c.json({ error: '驗證碼錯誤，需提供正確 TOTP 碼才能停用 MFA' }, 401);
  }

  await db.delete(schema.mfaTotp).where(eq(schema.mfaTotp.userId, sub));
  return c.json({ message: 'MFA 已停用' });
});

export { mfa };
