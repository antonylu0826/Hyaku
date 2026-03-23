import { requireEnv } from '@hayku/env';

export const config = {
  port: parseInt(process.env.PORT ?? '3100', 10),
  jwtSecret: requireEnv('JWT_SECRET', 'hayku-dev-secret-change-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  refreshTokenExpiresInDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '30', 10),
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  isDev: process.env.NODE_ENV !== 'production',
};
