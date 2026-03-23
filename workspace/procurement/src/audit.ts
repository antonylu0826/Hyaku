import { AuditClient } from '@hayku/audit-client';
import { config } from './config.js';

export const audit = new AuditClient({
  baseUrl: config.audit.serviceUrl,
  apiKey: config.audit.apiKey,
  silentFail: true,
});
