export const config = {
  port: parseInt(process.env.PORT ?? '3200', 10),
  identityServiceUrl: process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:3100',
  // API Key for authenticating with hayku-identity (service-to-service)
  identityApiKey: process.env.IDENTITY_API_KEY ?? '',
};
