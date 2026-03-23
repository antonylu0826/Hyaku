import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

let privateKeyPem: string;
let publicKeyPem: string;
let keyId: string;

/**
 * 初始化 RSA 金鑰對。
 * 生產環境：從 OIDC_PRIVATE_KEY 環境變數載入（PEM 格式，\n 用 \\n 跳脫）。
 * 開發環境：自動生成 2048-bit RSA 金鑰（每次重啟會不同）。
 */
export function initKeys(): void {
  keyId = config.oidcKeyId;

  if (config.oidcPrivateKey) {
    privateKeyPem = config.oidcPrivateKey.replace(/\\n/g, '\n');
    const pub = createPublicKey(createPrivateKey(privateKeyPem));
    publicKeyPem = pub.export({ type: 'spki', format: 'pem' }) as string;
  } else {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKeyPem = privateKey as string;
    publicKeyPem = publicKey as string;
    keyId = 'hayku-dev-key';
    console.log('⚠️  OIDC: 使用自動生成的 RSA 金鑰（開發環境），生產環境請設定 OIDC_PRIVATE_KEY');
  }
}

/** 使用 RS256 簽發 OIDC token */
export function signOidcToken(payload: object, expiresIn: number): string {
  return jwt.sign(payload, privateKeyPem, {
    algorithm: 'RS256',
    keyid: keyId,
    expiresIn,
  } as jwt.SignOptions);
}

/** 驗證 RS256 token */
export function verifyOidcToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, publicKeyPem, { algorithms: ['RS256'] }) as jwt.JwtPayload;
}

/** 回傳 JWKS（JSON Web Key Set），供業務服務驗證 token */
export function getJwks(): object {
  const key = createPublicKey(publicKeyPem);
  const jwk = key.export({ format: 'jwk' }) as Record<string, unknown>;
  return {
    keys: [{
      ...jwk,
      use: 'sig',
      alg: 'RS256',
      kid: keyId,
    }],
  };
}
