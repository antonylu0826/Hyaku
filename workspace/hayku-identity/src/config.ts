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
};
