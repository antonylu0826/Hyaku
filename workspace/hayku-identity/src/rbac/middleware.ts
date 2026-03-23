import type { Context, Next } from 'hono';
import { checkPermission } from './engine.js';

/**
 * 建立一個權限檢查中介層
 * 使用方式：requirePermission('document', 'read')
 *
 * 組織 ID 從 URL 參數 :orgId 取得
 */
export function requirePermission(resource: string, action: string) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    const orgId = c.req.param('orgId');

    if (!orgId) {
      return c.json({ error: '缺少組織 ID' }, 400);
    }

    // 超級管理員直接放行
    if (user.isSuperAdmin) {
      await next();
      return;
    }

    const hasPermission = await checkPermission(user.sub, orgId, resource, action);
    if (!hasPermission) {
      return c.json({ error: `缺少權限：${resource}:${action}` }, 403);
    }

    await next();
  };
}
