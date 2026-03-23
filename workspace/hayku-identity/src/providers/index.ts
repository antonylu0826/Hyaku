import type { IdentityProvider } from './interface.js';
import type { ExternalProvider } from './external.js';
import { LocalProvider } from './local.js';
import { GoogleProvider } from './google.js';
import { LdapProvider } from './ldap.js';
import { config } from '../config.js';

// ── 帳密型 provider（表單登入）──────────────────────────────
const credentialRegistry = new Map<string, IdentityProvider>();

export function registerProvider(provider: IdentityProvider): void {
  credentialRegistry.set(provider.id, provider);
}
export function getProvider(id: string): IdentityProvider | undefined {
  return credentialRegistry.get(id);
}
export function getAllProviders(): IdentityProvider[] {
  return Array.from(credentialRegistry.values());
}

// ── 外部重導向型 provider（OAuth2 callback）──────────────────
const externalRegistry = new Map<string, ExternalProvider>();

export function registerExternalProvider(provider: ExternalProvider): void {
  externalRegistry.set(provider.id, provider);
}
export function getExternalProvider(id: string): ExternalProvider | undefined {
  return externalRegistry.get(id);
}
export function getAllExternalProviders(): ExternalProvider[] {
  return Array.from(externalRegistry.values());
}

// ── 初始化：依環境變數決定啟用哪些 provider ──────────────────

// 本地帳號（永遠啟用）
registerProvider(new LocalProvider());

// Google OAuth（設定了 GOOGLE_CLIENT_ID 才啟用）
if (config.googleClientId && config.googleClientSecret) {
  const redirectUri = config.googleRedirectUri ?? `${config.oidcIssuer}/oauth/callback/google`;
  registerExternalProvider(new GoogleProvider(config.googleClientId, config.googleClientSecret, redirectUri));
  console.log('🔵 Google OAuth 已啟用');
}

// LDAP/AD（設定了 LDAP_URL 才啟用）
if (config.ldapUrl && config.ldapBindDn && config.ldapBindPassword && config.ldapSearchBase) {
  registerProvider(new LdapProvider(
    config.ldapUrl,
    config.ldapBindDn,
    config.ldapBindPassword,
    config.ldapSearchBase,
    config.ldapUserFilter,
  ));
  console.log('🏢 LDAP/AD 已啟用');
}
