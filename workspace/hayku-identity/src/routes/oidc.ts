import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { getJwks, verifyOidcToken } from '../oidc/keys.js';
import { SESSION_COOKIE, createSession, getSessionUserId } from '../oidc/session.js';
import { issueOidcTokens } from '../oidc/token.js';
import { verifyTotp } from '../oidc/mfa.js';
import {
  getAllProviders, getProvider,
  getAllExternalProviders, getExternalProvider,
} from '../providers/index.js';
import { renderLoginPage, renderMfaPage } from '../views/login.js';

const oidc = new Hono();

// ─── OIDC Discovery ───────────────────────────────────────────────────────────

oidc.get('/.well-known/openid-configuration', (c) => {
  const issuer = config.oidcIssuer;
  return c.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    jwks_uri: `${issuer}/oauth/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256'],
  });
});

oidc.get('/oauth/jwks', (c) => c.json(getJwks()));

// ─── 共用工具 ──────────────────────────────────────────────────────────────────

async function validateAuthRequest(params: URLSearchParams): Promise<string | null> {
  if (params.get('response_type') !== 'code') return 'unsupported_response_type';
  if (!params.get('client_id')) return 'missing_client_id';
  if (!params.get('redirect_uri')) return 'missing_redirect_uri';

  const client = await db.query.oauthClients.findFirst({
    where: and(
      eq(schema.oauthClients.clientId, params.get('client_id')!),
      eq(schema.oauthClients.isActive, true),
    ),
  });
  if (!client) return 'invalid_client';

  const allowedUris: string[] = JSON.parse(client.redirectUris);
  if (!allowedUris.includes(params.get('redirect_uri')!)) return 'invalid_redirect_uri';
  return null;
}

async function issueCode(userId: string, params: URLSearchParams): Promise<string> {
  const code = randomBytes(24).toString('hex');
  await db.insert(schema.oauthCodes).values({
    code,
    clientId: params.get('client_id')!,
    userId,
    redirectUri: params.get('redirect_uri')!,
    scope: params.get('scope') ?? 'openid',
    codeChallenge: params.get('code_challenge') ?? null,
    codeChallengeMethod: params.get('code_challenge_method') ?? null,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  const redirectUrl = new URL(params.get('redirect_uri')!);
  redirectUrl.searchParams.set('code', code);
  if (params.get('state')) redirectUrl.searchParams.set('state', params.get('state')!);
  return redirectUrl.toString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setCookieAndRedirect(c: any, sessionToken: string, redirectUrl: string) {
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: !config.isDev,
    sameSite: 'Lax',
    maxAge: config.oidcSessionHours * 3600,
    path: '/',
  });
  return c.redirect(redirectUrl);
}

// ─── Authorize ────────────────────────────────────────────────────────────────

oidc.get('/oauth/authorize', async (c) => {
  const params = new URLSearchParams(c.req.url.split('?')[1] ?? '');
  const error = await validateAuthRequest(params);
  if (error) return c.text(`Authorization error: ${error}`, 400);

  // SSO check
  const sessionToken = getCookie(c, SESSION_COOKIE);
  if (sessionToken) {
    const userId = await getSessionUserId(sessionToken);
    if (userId) return c.redirect(await issueCode(userId, params));
  }

  const client = await db.query.oauthClients.findFirst({
    where: eq(schema.oauthClients.clientId, params.get('client_id')!),
  });

  return c.html(renderLoginPage({
    clientName: client!.name,
    params: Object.fromEntries(params.entries()),
    providers: getAllProviders().map((p) => ({ id: p.id, displayName: p.displayName })),
    externalProviders: getAllExternalProviders().map((p) => ({ id: p.id, displayName: p.displayName })),
  }));
});

oidc.post('/oauth/authorize', async (c) => {
  const body = await c.req.parseBody();
  const params = new URLSearchParams();
  for (const key of ['client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'response_type']) {
    if (body[key]) params.set(key, body[key] as string);
  }

  const error = await validateAuthRequest(params);
  if (error) return c.text(`Authorization error: ${error}`, 400);

  const providerId = (body['provider'] as string) ?? 'local';
  const provider = getProvider(providerId);
  if (!provider) return c.text('Unknown provider', 400);

  const client = await db.query.oauthClients.findFirst({
    where: eq(schema.oauthClients.clientId, params.get('client_id')!),
  });

  const result = await provider.authenticate({
    email: (body['email'] as string) ?? '',
    password: (body['password'] as string) ?? '',
  });

  if (!result) {
    return c.html(renderLoginPage({
      clientName: client!.name,
      params: Object.fromEntries(params.entries()),
      error: 'Email 或密碼錯誤',
      providers: getAllProviders().map((p) => ({ id: p.id, displayName: p.displayName })),
      externalProviders: getAllExternalProviders().map((p) => ({ id: p.id, displayName: p.displayName })),
    }));
  }

  // MFA 檢查
  const mfaRecord = await db.query.mfaTotp.findFirst({
    where: eq(schema.mfaTotp.userId, result.userId),
  });
  if (mfaRecord?.verifiedAt) {
    // 建立暫存 pending session，等待 TOTP
    const pendingToken = randomBytes(32).toString('hex');
    await db.insert(schema.mfaPending).values({
      pendingToken,
      userId: result.userId,
      oidcParams: JSON.stringify(Object.fromEntries(params.entries())),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    return c.html(renderMfaPage({ clientName: client!.name, pendingToken }));
  }

  // 無 MFA → 直接建立 session + 發 code
  const sessionToken = await createSession(result.userId);
  const redirectUrl = await issueCode(result.userId, params);
  return setCookieAndRedirect(c, sessionToken, redirectUrl);
});

// ─── MFA 驗證（登入流程中）────────────────────────────────────────────────────

oidc.post('/oauth/mfa-verify', async (c) => {
  const body = await c.req.parseBody();
  const pendingToken = (body['pending_token'] as string) ?? '';
  const code = (body['code'] as string) ?? '';

  const pending = await db.query.mfaPending.findFirst({
    where: and(
      eq(schema.mfaPending.pendingToken, pendingToken),
      gt(schema.mfaPending.expiresAt, new Date()),
    ),
  });

  if (!pending) return c.text('驗證請求無效或已過期，請重新登入', 400);

  const mfaRecord = await db.query.mfaTotp.findFirst({
    where: eq(schema.mfaTotp.userId, pending.userId),
  });
  if (!mfaRecord?.verifiedAt) return c.text('MFA 設定異常', 500);

  // 刪除 pending（one-time use）
  await db.delete(schema.mfaPending).where(eq(schema.mfaPending.id, pending.id));

  if (!verifyTotp(mfaRecord.secret, code)) {
    // 重新建立 pending token 讓使用者再試
    const newPendingToken = randomBytes(32).toString('hex');
    await db.insert(schema.mfaPending).values({
      pendingToken: newPendingToken,
      userId: pending.userId,
      oidcParams: pending.oidcParams,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    const oidcParams = JSON.parse(pending.oidcParams) as Record<string, string>;
    const client = await db.query.oauthClients.findFirst({
      where: eq(schema.oauthClients.clientId, oidcParams['client_id'] ?? ''),
    });
    return c.html(renderMfaPage({ clientName: client?.name ?? 'App', pendingToken: newPendingToken, error: '驗證碼錯誤，請重試' }));
  }

  const params = new URLSearchParams(JSON.parse(pending.oidcParams));
  const sessionToken = await createSession(pending.userId);
  const redirectUrl = await issueCode(pending.userId, params);
  return setCookieAndRedirect(c, sessionToken, redirectUrl);
});

// ─── External Provider（Google 等）────────────────────────────────────────────

// GET /oauth/external-start/:provider — 重導向到外部 IdP
oidc.get('/oauth/external-start/:provider', async (c) => {
  const providerId = c.req.param('provider');
  const provider = getExternalProvider(providerId);
  if (!provider) return c.text('Provider not found', 404);

  const qs = c.req.url.split('?')[1] ?? '';
  const params = new URLSearchParams(qs);
  const error = await validateAuthRequest(params);
  if (error) return c.text(`Authorization error: ${error}`, 400);

  // state 編碼原始 OIDC 參數，callback 時還原
  const state = Buffer.from(JSON.stringify({
    provider: providerId,
    oidcParams: Object.fromEntries(params.entries()),
  })).toString('base64url');

  return c.redirect(provider.getAuthorizationUrl(state));
});

// GET /oauth/callback/:provider — 外部 IdP 回調
oidc.get('/oauth/callback/:provider', async (c) => {
  const providerId = c.req.param('provider');
  const provider = getExternalProvider(providerId);
  if (!provider) return c.text('Provider not found', 404);

  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.text('Invalid callback', 400);

  let oidcParams: Record<string, string>;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    oidcParams = decoded.oidcParams;
  } catch {
    return c.text('Invalid state', 400);
  }

  const result = await provider.handleCallback(code);
  if (!result) return c.text('外部登入失敗，請重試', 401);

  const params = new URLSearchParams(oidcParams);
  const sessionToken = await createSession(result.userId);
  const redirectUrl = await issueCode(result.userId, params);
  return setCookieAndRedirect(c, sessionToken, redirectUrl);
});

// ─── Token Endpoint ───────────────────────────────────────────────────────────

oidc.post('/oauth/token', async (c) => {
  const contentType = c.req.header('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await c.req.json().catch(() => ({}))
    : await c.req.parseBody();

  if (body['grant_type'] !== 'authorization_code') {
    return c.json({ error: 'unsupported_grant_type' }, 400);
  }

  const code = body['code'] as string;
  const clientId = body['client_id'] as string;
  const redirectUri = body['redirect_uri'] as string;
  const codeVerifier = body['code_verifier'] as string | undefined;

  if (!code || !clientId || !redirectUri) return c.json({ error: 'invalid_request' }, 400);

  const client = await db.query.oauthClients.findFirst({
    where: and(eq(schema.oauthClients.clientId, clientId), eq(schema.oauthClients.isActive, true)),
  });
  if (!client) return c.json({ error: 'invalid_client' }, 401);

  if (client.clientSecret) {
    if (body['client_secret'] !== client.clientSecret) return c.json({ error: 'invalid_client' }, 401);
  }

  const [authCode] = await db
    .select()
    .from(schema.oauthCodes)
    .where(and(
      eq(schema.oauthCodes.code, code),
      eq(schema.oauthCodes.clientId, clientId),
      gt(schema.oauthCodes.expiresAt, new Date()),
    ))
    .limit(1);

  if (!authCode || authCode.usedAt) return c.json({ error: 'invalid_grant' }, 400);
  if (authCode.redirectUri !== redirectUri) return c.json({ error: 'invalid_grant' }, 400);

  if (authCode.codeChallenge) {
    if (!codeVerifier) return c.json({ error: 'invalid_grant' }, 400);
    const { createHash } = await import('node:crypto');
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
    if (challenge !== authCode.codeChallenge) return c.json({ error: 'invalid_grant' }, 400);
  }

  await db.update(schema.oauthCodes).set({ usedAt: new Date() }).where(eq(schema.oauthCodes.id, authCode.id));

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, authCode.userId) });
  if (!user || !user.isActive) return c.json({ error: 'invalid_grant' }, 400);

  return c.json(issueOidcTokens(
    { id: user.id, email: user.email, displayName: user.displayName, isSuperAdmin: user.isSuperAdmin },
    clientId,
    authCode.scope,
  ));
});

// ─── UserInfo ─────────────────────────────────────────────────────────────────

oidc.get('/oauth/userinfo', async (c) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401);

  let payload: ReturnType<typeof verifyOidcToken>;
  try { payload = verifyOidcToken(header.slice(7)); } catch { return c.json({ error: 'invalid_token' }, 401); }

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, payload.sub!) });
  if (!user || !user.isActive) return c.json({ error: 'invalid_token' }, 401);

  return c.json({ sub: user.id, email: user.email, name: user.displayName, is_super_admin: user.isSuperAdmin });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

oidc.get('/oauth/logout', async (c) => {
  const sessionToken = getCookie(c, SESSION_COOKIE);
  if (sessionToken) {
    const { destroySession } = await import('../oidc/session.js');
    await destroySession(sessionToken);
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  const postLogoutUri = c.req.query('post_logout_redirect_uri');
  return c.redirect(postLogoutUri ?? `${config.oidcIssuer}/oauth/authorize`);
});

export { oidc };
