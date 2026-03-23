import { requireEnv } from '@hayku/env';

export const config = {
  port: parseInt(process.env.PORT ?? '3100', 10),
  jwtSecret: requireEnv('JWT_SECRET', 'hayku-dev-secret-change-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  refreshTokenExpiresInDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '30', 10),
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  isDev: process.env.NODE_ENV !== 'production',

  // OIDC Server 設定
  oidcIssuer: process.env.OIDC_ISSUER ?? 'http://localhost:3100',
  oidcSessionHours: parseInt(process.env.OIDC_SESSION_HOURS ?? '8', 10),
  oidcPrivateKey: process.env.OIDC_PRIVATE_KEY,   // PEM 格式，未設定時自動生成（僅開發）
  oidcKeyId: process.env.OIDC_KEY_ID ?? 'hayku-key-1',

  // Google OAuth（未設定則不啟用）
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,  // 預設 ${oidcIssuer}/oauth/callback/google

  // LDAP/AD（未設定則不啟用）
  ldapUrl: process.env.LDAP_URL,                         // e.g. ldaps://ad.company.com
  ldapBindDn: process.env.LDAP_BIND_DN,                  // 服務帳號 DN
  ldapBindPassword: process.env.LDAP_BIND_PASSWORD,
  ldapSearchBase: process.env.LDAP_SEARCH_BASE,          // e.g. DC=company,DC=com
  ldapUserFilter: process.env.LDAP_USER_FILTER ?? '(mail={{email}})', // {{email}} 會被替換
};
