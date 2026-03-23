import { signOidcToken } from './keys.js';
import { config } from '../config.js';

const ACCESS_TOKEN_TTL = 900;   // 15 分鐘
const ID_TOKEN_TTL = 900;

export interface OidcTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  id_token: string;
  scope: string;
}

interface UserClaims {
  id: string;
  email: string;
  displayName: string;
  isSuperAdmin: boolean;
}

/** 發行 OIDC access token + ID token（RS256） */
export function issueOidcTokens(user: UserClaims, clientId: string, scope: string): OidcTokenResponse {
  const now = Math.floor(Date.now() / 1000);
  const base = {
    iss: config.oidcIssuer,
    sub: user.id,
    aud: clientId,
    iat: now,
    email: user.email,
    name: user.displayName,
    is_super_admin: user.isSuperAdmin,
  };

  const accessToken = signOidcToken({ ...base, token_type: 'access_token' }, ACCESS_TOKEN_TTL);
  const idToken     = signOidcToken({ ...base, token_type: 'id_token' }, ID_TOKEN_TTL);

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL,
    id_token: idToken,
    scope,
  };
}
