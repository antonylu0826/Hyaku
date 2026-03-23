import type { IdentityProvider } from './interface.js';
import { LocalProvider } from './local.js';

const registry = new Map<string, IdentityProvider>();

export function registerProvider(provider: IdentityProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: string): IdentityProvider | undefined {
  return registry.get(id);
}

export function getAllProviders(): IdentityProvider[] {
  return Array.from(registry.values());
}

// 預設註冊本地帳號 provider
registerProvider(new LocalProvider());
