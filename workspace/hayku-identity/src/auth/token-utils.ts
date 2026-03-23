import crypto from 'node:crypto';

/** 產生隨機 opaque token */
export function generateToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SHA-256 hash（資料庫只存 hash，不存明文） */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
