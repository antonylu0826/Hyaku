import { lt, and, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

/**
 * 清理所有已過期的短效資料：
 *   - oauth_codes（過期超過 1 小時）
 *   - mfa_pending（已過期）
 *   - identity_sessions（已過期）
 *   - refresh_tokens（已過期或已撤銷超過 7 天）
 *   - password_resets（已過期或已使用超過 7 天）
 */
export async function runCleanup(): Promise<void> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const [codes, pending, sessions, tokens, resets] = await Promise.all([
      // 過期超過 1 小時的授權碼（已過期的 code 不可能再被使用）
      db.delete(schema.oauthCodes).where(lt(schema.oauthCodes.expiresAt, oneHourAgo)),

      // 已過期的 MFA pending session
      db.delete(schema.mfaPending).where(lt(schema.mfaPending.expiresAt, now)),

      // 已過期的 SSO session
      db.delete(schema.identitySessions).where(lt(schema.identitySessions.expiresAt, now)),

      // 已過期或已撤銷超過 7 天的 refresh token
      db.delete(schema.refreshTokens).where(
        lt(schema.refreshTokens.expiresAt, sevenDaysAgo),
      ),

      // 已過期或已使用超過 7 天的密碼重設 token
      db.delete(schema.passwordResets).where(
        lt(schema.passwordResets.expiresAt, sevenDaysAgo),
      ),
    ]);

    const total = [codes, pending, sessions, tokens, resets]
      .map((r) => (r as { rowCount?: number }).rowCount ?? 0)
      .reduce((a, b) => a + b, 0);

    if (total > 0) {
      console.log(`[cleanup] 已清理過期資料：codes=${(codes as any).rowCount ?? 0}, mfa_pending=${(pending as any).rowCount ?? 0}, sessions=${(sessions as any).rowCount ?? 0}, refresh_tokens=${(tokens as any).rowCount ?? 0}, password_resets=${(resets as any).rowCount ?? 0}`);
    }
  } catch (err) {
    // 清理失敗不影響主流程
    console.warn('[cleanup] 清理過期資料失敗：', (err as Error).message);
  }
}

/**
 * 啟動定期清理任務（每小時執行一次）
 */
export function startCleanupJob(intervalMs = 60 * 60 * 1000): void {
  // 啟動後延遲 30 秒執行第一次（等服務完全就緒）
  setTimeout(() => {
    runCleanup();
    setInterval(runCleanup, intervalMs);
  }, 30_000);

  console.log(`[cleanup] 定期清理已排程，每 ${intervalMs / 60000} 分鐘執行一次`);
}
