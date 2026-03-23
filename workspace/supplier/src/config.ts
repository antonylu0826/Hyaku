import { requireEnv } from '@hayku/env';

export const config = {
  port: parseInt(process.env.PORT ?? '3301', 10),
  jwtSecret: requireEnv('JWT_SECRET', 'hayku-dev-secret-change-in-production'),
  isDev: process.env.NODE_ENV !== 'production',
  audit: {
    serviceUrl: process.env.AUDIT_SERVICE_URL ?? 'http://localhost:3200',
    apiKey: process.env.AUDIT_API_KEY ?? '',
  },
};
