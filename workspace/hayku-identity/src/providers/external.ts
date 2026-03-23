/** 外部 IdP（OAuth2 重導向流程）的共用介面 */
export interface ExternalAuthResult {
  userId: string;
  email: string;
  displayName: string;
}

export interface ExternalProvider {
  readonly id: string;
  readonly displayName: string;
  /** 回傳要重導向到的外部登入 URL，state 帶回原始 OIDC 參數 */
  getAuthorizationUrl(state: string): string;
  /** 處理外部 IdP 的 callback，回傳本地使用者資訊 */
  handleCallback(code: string): Promise<ExternalAuthResult | null>;
}
