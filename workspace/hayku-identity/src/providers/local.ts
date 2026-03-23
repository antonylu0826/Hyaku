import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { verifyPassword } from '../auth/password.js';
import type { IdentityProvider, AuthResult } from './interface.js';

/** 本地帳號密碼認證 — provider = 'local' */
export class LocalProvider implements IdentityProvider {
  readonly id = 'local';
  readonly displayName = '帳號密碼登入';

  async authenticate(credentials: Record<string, string>): Promise<AuthResult | null> {
    const { email, password } = credentials;
    if (!email || !password) return null;

    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });

    if (!user || !user.isActive || user.provider !== 'local' || !user.passwordHash) {
      return null;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return null;

    return { userId: user.id, email: user.email, displayName: user.displayName };
  }
}
