export interface AuthResult {
  userId: string;
  email: string;
  displayName: string;
}

/**
 * 身份提供者介面 — 所有 IdP 實作必須符合此契約。
 * Phase 1: LocalProvider
 * Phase 2: OidcProvider（Google / Azure AD / Keycloak）
 * Phase 3: LdapProvider（AD 直連）
 */
export interface IdentityProvider {
  /** 唯一識別碼，如 'local' | 'google' | 'ldap' */
  readonly id: string;
  /** 顯示在登入頁的名稱 */
  readonly displayName: string;
  /**
   * 驗證憑證，成功回傳 AuthResult，失敗回傳 null。
   * credentials 的 key 由各 provider 自行定義。
   */
  authenticate(credentials: Record<string, string>): Promise<AuthResult | null>;
}
