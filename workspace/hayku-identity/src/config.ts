const isProd = process.env.NODE_ENV === 'production';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProd) throw new Error(`環境變數 ${name} 在生產環境中必須設定`);
  if (fallback !== undefined) return fallback;
  throw new Error(`環境變數 ${name} 未設定`);
}

export const config = {
  port: parseInt(process.env.PORT ?? '3100', 10),
  jwtSecret: requireEnv('JWT_SECRET', 'hayku-dev-secret-change-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  refreshTokenExpiresInDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '30', 10),
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  isDev: !isProd,
};
