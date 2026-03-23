import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { ExternalProvider, ExternalAuthResult } from './external.js';

export class GoogleProvider implements ExternalProvider {
  readonly id = 'google';
  readonly displayName = 'Google 帳號';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async handleCallback(code: string): Promise<ExternalAuthResult | null> {
    // Step 1: 用 code 換 access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json() as { access_token: string };

    // Step 2: 取 Google 使用者資訊
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userRes.ok) return null;

    const info = await userRes.json() as {
      sub: string; email: string; name: string; email_verified: boolean;
    };
    if (!info.email_verified) return null;

    // Step 3: 查找或自動建立本地使用者
    let user = await db.query.users.findFirst({ where: eq(schema.users.email, info.email) });

    if (!user) {
      const [created] = await db.insert(schema.users).values({
        email: info.email,
        displayName: info.name,
        provider: 'google',
        isActive: true,
        isSuperAdmin: false,
      }).returning();
      user = created;
    }

    if (!user.isActive) return null;

    return { userId: user.id, email: user.email, displayName: user.displayName };
  }
}
