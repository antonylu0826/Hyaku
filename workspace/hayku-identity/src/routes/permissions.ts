import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { authMiddleware, superAdminMiddleware } from '../auth/index.js';
import { checkPermission, getUserPermissions } from '../rbac/index.js';
import { createPermissionSchema, checkPermissionSchema } from '../validators.js';

const perms = new Hono();

perms.use('/*', authMiddleware);

// POST /permissions — 建立全域權限定義（僅超級管理員）
perms.post('/', superAdminMiddleware, async (c) => {
  const body = await c.req.json();
  const parsed = createPermissionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const [perm] = await db.insert(schema.permissions).values(parsed.data).returning();
  return c.json(perm, 201);
});

// GET /permissions — 列出所有權限定義
perms.get('/', async (c) => {
  const all = await db.query.permissions.findMany();
  return c.json(all);
});

// POST /permissions/check — 檢查權限（供其他系統呼叫）
perms.post('/check', async (c) => {
  const body = await c.req.json();
  const parsed = checkPermissionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗' }, 400);
  }

  const user = c.get('user');
  const orgId = c.req.header('X-Org-Id');
  if (!orgId) {
    return c.json({ error: '缺少 X-Org-Id header' }, 400);
  }

  const allowed = await checkPermission(user.sub, orgId, parsed.data.resource, parsed.data.action);
  return c.json({ allowed });
});

// GET /permissions/mine — 取得當前使用者在指定組織的所有權限
perms.get('/mine', async (c) => {
  const user = c.get('user');
  const orgId = c.req.header('X-Org-Id');
  if (!orgId) {
    return c.json({ error: '缺少 X-Org-Id header' }, 400);
  }

  if (user.isSuperAdmin) {
    return c.json({ superAdmin: true, permissions: '*' });
  }

  const permissions = await getUserPermissions(user.sub, orgId);
  return c.json({ permissions });
});

export { perms };
