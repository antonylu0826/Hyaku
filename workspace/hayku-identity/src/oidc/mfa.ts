import { createHmac, randomBytes } from 'node:crypto';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let result = '', bits = 0, current = 0;
  for (const byte of buf) {
    current = (current << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(current >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32_CHARS[(current << (5 - bits)) & 0x1f];
  return result;
}

function base32Decode(str: string): Buffer {
  const s = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, current = 0;
  const result: number[] = [];
  for (const char of s) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue;
    current = (current << 5) | val;
    bits += 5;
    if (bits >= 8) {
      result.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(result);
}

/** 產生 20 bytes 的 TOTP secret（base32 編碼） */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** 產生 otpauth:// URI，供 Authenticator App 掃描 */
export function generateTotpUri(secret: string, email: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`
    + `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function hotp(secret: string, counter: bigint): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | (hmac[offset + 1] << 16)
    | (hmac[offset + 2] << 8)
    | hmac[offset + 3];
  return (code % 1_000_000).toString().padStart(6, '0');
}

/**
 * 驗證 TOTP 碼，允許前後 1 個時間視窗（±30 秒容差）。
 * windowSize=1 表示接受 [-30s, 0, +30s] 三個視窗。
 */
export function verifyTotp(secret: string, code: string, windowSize = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const now = BigInt(Math.floor(Date.now() / 30000));
  for (let i = -windowSize; i <= windowSize; i++) {
    if (hotp(secret, now + BigInt(i)) === code) return true;
  }
  return false;
}
