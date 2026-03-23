import { Client, InvalidCredentialsError } from 'ldapts';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { IdentityProvider, AuthResult } from './interface.js';

export class LdapProvider implements IdentityProvider {
  readonly id = 'ldap';
  readonly displayName = 'AD 帳號登入';

  constructor(
    private readonly url: string,
    private readonly bindDn: string,
    private readonly bindPassword: string,
    private readonly searchBase: string,
    private readonly userFilter: string, // 包含 {{email}} 佔位符
  ) {}

  async authenticate(credentials: Record<string, string>): Promise<AuthResult | null> {
    const { email, password } = credentials;
    if (!email || !password) return null;

    const client = new Client({ url: this.url, tlsOptions: { rejectUnauthorized: false } });

    try {
      // Step 1: 用服務帳號搜尋使用者 DN
      await client.bind(this.bindDn, this.bindPassword);
      const filter = this.userFilter.replace('{{email}}', email.replace(/[*()\\]/g, '\\$&'));
      const { searchEntries } = await client.search(this.searchBase, {
        filter,
        attributes: ['dn', 'mail', 'displayName', 'cn'],
        sizeLimit: 1,
      });

      if (searchEntries.length === 0) return null;
      const entry = searchEntries[0];
      const userDn = entry.dn;
      const displayName = String(entry.displayName ?? entry.cn ?? email.split('@')[0]);

      // Step 2: 用使用者的 DN + 密碼嘗試 bind（驗證密碼）
      await client.unbind();
      await client.bind(userDn, password);

      // Step 3: 查找或自動建立本地使用者
      let user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });

      if (!user) {
        const [created] = await db.insert(schema.users).values({
          email,
          displayName,
          provider: 'ldap',
          isActive: true,
          isSuperAdmin: false,
        }).returning();
        user = created;
      }

      if (!user.isActive) return null;

      return { userId: user.id, email: user.email, displayName: user.displayName };
    } catch (err) {
      if (err instanceof InvalidCredentialsError) return null;
      throw err;
    } finally {
      await client.unbind().catch(() => {});
    }
  }
}
