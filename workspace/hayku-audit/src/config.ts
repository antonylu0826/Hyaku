import { requireEnv } from '@hayku/env';

export const config = {
  port: parseInt(process.env.PORT ?? '3200', 10),
  identityServiceUrl: requireEnv('IDENTITY_SERVICE_URL', 'http://localhost:3100'),
  identityApiKey: process.env.IDENTITY_API_KEY ?? '',
};
