import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes, createHash } from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { getJwks, verifyOidcToken } from '../oidc/keys.js';
import { SESSION_COOKIE, createSession, getSessionUserId } from '../oidc/session.js';
import { issueOidcTokens } from '../oidc/token.js';
import { getAllProviders, getProvider } from '../providers/index.js';
import { renderLoginPage } from '../views/login.js';

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

// ─── JWKS ─────────────────────────────────────────────────────────────────────

oidc.get('/oauth/jwks', (c) => c.json(getJwks()));

// ─── Authorization Endpoint ───────────────────────────────────────────────────

/** 驗證授權請求參數，回傳錯誤字串或 null */
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

/** 產生授權碼並重導向回 client */
async function issueCode(userId: string, params: URLSearchParams): Promise<string> {
  const code = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 分鐘

  await db.insert(schema.oauthCodes).values({
    code,
    clientId: params.get('client_id')!,
    userId,
    redirectUri: params.get('redirect_uri')!,
    scope: params.get('scope') ?? 'openid',
    codeChallenge: params.get('code_challenge') ?? null,
    codeChallengeMethod: params.get('code_challenge_method') ?? null,
    expiresAt,
  });

  const redirectUrl = new URL(params.get('redirect_uri')!);
  redirectUrl.searchParams.set('code', code);
  if (params.get('state')) redirectUrl.searchParams.set('state', params.get('state')!);
  return redirectUrl.toString();
}

// GET /oauth/authorize — 顯示登入頁或（已有 session）直接發 code
oidc.get('/oauth/authorize', async (c) => {
  const params = new URLSearchParams(c.req.url.split('?')[1] ?? '');
  const error = await validateAuthRequest(params);
  if (error) return c.text(`Authorization error: ${error}`, 400);

  // 檢查現有 session → SSO 效果
  const sessionToken = getCookie(c, SESSION_COOKIE);
  if (sessionToken) {
    const userId = await getSessionUserId(sessionToken);
    if (userId) {
      const redirectUrl = await issueCode(userId, params);
      return c.redirect(redirectUrl);
    }
  }

  // 無 session → 顯示登入頁
  const client = await db.query.oauthClients.findFirst({
    where: eq(schema.oauthClients.clientId, params.get('client_id')!),
  });

  return c.html(renderLoginPage({
    clientName: client!.name,
    params: Object.fromEntries(params.entries()),
    providers: getAllProviders().map((p) => ({ id: p.id, displayName: p.displayName })),
  }));
});

// POST /oauth/authorize — 表單提交，驗證帳密，成功發 code
oidc.post('/oauth/authorize', async (c) => {
  const body = await c.req.parseBody();
  const params = new URLSearchParams();

  // 從 form body 還原 OIDC 參數
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
    email: body['email'] as string ?? '',
    password: body['password'] as string ?? '',
  });

  if (!result) {
    return c.html(renderLoginPage({
      clientName: client!.name,
      params: Object.fromEntries(params.entries()),
      error: 'Email 或密碼錯誤',
      providers: getAllProviders().map((p) => ({ id: p.id, displayName: p.displayName })),
    }));
  }

  // 建立 session → SSO cookie
  const sessionToken = await createSession(result.userId);
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: !config.isDev,
    sameSite: 'Lax',
    maxAge: config.oidcSessionHours * 3600,
    path: '/',
  });

  const redirectUrl = await issueCode(result.userId, params);
  return c.redirect(redirectUrl);
});

// ─── Token Endpoint ───────────────────────────────────────────────────────────

oidc.post('/oauth/token', async (c) => {
  // 同時支援 application/x-www-form-urlencoded（OAuth2 標準）和 application/json（測試方便）
  const contentType = c.req.header('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await c.req.json().catch(() => ({}))
    : await c.req.parseBody();
  const grantType = body['grant_type'] as string;

  if (grantType !== 'authorization_code') {
    return c.json({ error: 'unsupported_grant_type' }, 400);
  }

  const code = body['code'] as string;
  const clientId = body['client_id'] as string;
  const redirectUri = body['redirect_uri'] as string;
  const codeVerifier = body['code_verifier'] as string | undefined;

  if (!code || !clientId || !redirectUri) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  // 驗證 client
  const client = await db.query.oauthClients.findFirst({
    where: and(
      eq(schema.oauthClients.clientId, clientId),
      eq(schema.oauthClients.isActive, true),
    ),
  });
  if (!client) return c.json({ error: 'invalid_client' }, 401);

  // confidential client 需驗 secret
  if (client.clientSecret) {
    const secret = body['client_secret'] as string;
    if (secret !== client.clientSecret) return c.json({ error: 'invalid_client' }, 401);
  }

  // 取出並驗證授權碼
  const [authCode] = await db
    .select()
    .from(schema.oauthCodes)
    .where(
      and(
        eq(schema.oauthCodes.code, code),
        eq(schema.oauthCodes.clientId, clientId),
        gt(schema.oauthCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!authCode || authCode.usedAt) return c.json({ error: 'invalid_grant' }, 400);
  if (authCode.redirectUri !== redirectUri) return c.json({ error: 'invalid_grant' }, 400);

  // PKCE 驗證
  if (authCode.codeChallenge) {
    if (!codeVerifier) return c.json({ error: 'invalid_grant' }, 400);
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
    if (challenge !== authCode.codeChallenge) return c.json({ error: 'invalid_grant' }, 400);
  }

  // 標記授權碼已使用（one-time use）
  await db.update(schema.oauthCodes)
    .set({ usedAt: new Date() })
    .where(eq(schema.oauthCodes.id, authCode.id));

  // 取使用者資料
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, authCode.userId),
  });
  if (!user || !user.isActive) return c.json({ error: 'invalid_grant' }, 400);

  const tokens = issueOidcTokens(
    { id: user.id, email: user.email, displayName: user.displayName, isSuperAdmin: user.isSuperAdmin },
    clientId,
    authCode.scope,
  );

  return c.json(tokens);
});

// ─── UserInfo Endpoint ────────────────────────────────────────────────────────

oidc.get('/oauth/userinfo', async (c) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401);

  let payload: ReturnType<typeof verifyOidcToken>;
  try {
    payload = verifyOidcToken(header.slice(7));
  } catch {
    return c.json({ error: 'invalid_token' }, 401);
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, payload.sub!),
  });
  if (!user || !user.isActive) return c.json({ error: 'invalid_token' }, 401);

  return c.json({
    sub: user.id,
    email: user.email,
    name: user.displayName,
    is_super_admin: user.isSuperAdmin,
  });
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
  return c.redirect(postLogoutUri ?? '/');
});

export { oidc };
