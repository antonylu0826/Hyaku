import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { authMiddleware } from '../auth/index.js';
import { createOrgSchema, addMemberSchema, createDepartmentSchema, createRoleSchema } from '../validators.js';

const orgs = new Hono();

// 所有組織路由都需要認證
orgs.use('/*', authMiddleware);

// POST /orgs — 建立組織
orgs.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const existing = await db.query.organizations.findFirst({
    where: eq(schema.organizations.slug, parsed.data.slug),
  });
  if (existing) {
    return c.json({ error: '此 slug 已被使用' }, 409);
  }

  const [org] = await db.insert(schema.organizations).values(parsed.data).returning();
  const user = c.get('user');

  // 建立者自動成為組織成員
  const [member] = await db.insert(schema.orgMembers).values({
    userId: user.sub,
    orgId: org.id,
  }).returning();

  // 建立預設的 admin 角色並指派給建立者
  const [adminRole] = await db.insert(schema.roles).values({
    orgId: org.id,
    name: 'admin',
    description: '組織管理員',
    isDefault: false,
  }).returning();

  await db.insert(schema.memberRoles).values({
    memberId: member.id,
    roleId: adminRole.id,
  });

  return c.json({ org, role: adminRole }, 201);
});

// GET /orgs — 列出使用者所屬的組織
orgs.get('/', async (c) => {
  const user = c.get('user');

  const memberships = await db
    .select({
      orgId: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      description: schema.organizations.description,
    })
    .from(schema.orgMembers)
    .innerJoin(schema.organizations, eq(schema.orgMembers.orgId, schema.organizations.id))
    .where(eq(schema.orgMembers.userId, user.sub));

  return c.json(memberships);
});

// GET /orgs/:orgId
orgs.get('/:orgId', async (c) => {
  const orgId = c.req.param('orgId');
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, orgId),
  });

  if (!org) return c.json({ error: '組織不存在' }, 404);
  return c.json(org);
});

// ─── 部門 ───────────────────────────────────────────

// POST /orgs/:orgId/departments
orgs.post('/:orgId/departments', async (c) => {
  const orgId = c.req.param('orgId');
  const body = await c.req.json();
  const parsed = createDepartmentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const [dept] = await db.insert(schema.departments).values({
    orgId,
    ...parsed.data,
  }).returning();

  return c.json(dept, 201);
});

// GET /orgs/:orgId/departments
orgs.get('/:orgId/departments', async (c) => {
  const orgId = c.req.param('orgId');
  const depts = await db.query.departments.findMany({
    where: eq(schema.departments.orgId, orgId),
  });
  return c.json(depts);
});

// ─── 成員 ───────────────────────────────────────────

// POST /orgs/:orgId/members
orgs.post('/:orgId/members', async (c) => {
  const orgId = c.req.param('orgId');
  const body = await c.req.json();
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const [member] = await db.insert(schema.orgMembers).values({
    userId: parsed.data.userId,
    orgId,
    departmentId: parsed.data.departmentId,
  }).returning();

  // 指派角色
  if (parsed.data.roleIds?.length) {
    await db.insert(schema.memberRoles).values(
      parsed.data.roleIds.map(roleId => ({
        memberId: member.id,
        roleId,
      })),
    );
  }

  return c.json(member, 201);
});

// GET /orgs/:orgId/members
orgs.get('/:orgId/members', async (c) => {
  const orgId = c.req.param('orgId');

  const members = await db
    .select({
      memberId: schema.orgMembers.id,
      userId: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      departmentId: schema.orgMembers.departmentId,
    })
    .from(schema.orgMembers)
    .innerJoin(schema.users, eq(schema.orgMembers.userId, schema.users.id))
    .where(eq(schema.orgMembers.orgId, orgId));

  return c.json(members);
});

// ─── 角色 ───────────────────────────────────────────

// POST /orgs/:orgId/roles
orgs.post('/:orgId/roles', async (c) => {
  const orgId = c.req.param('orgId');
  const body = await c.req.json();
  const parsed = createRoleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '輸入驗證失敗', details: parsed.error.flatten() }, 400);
  }

  const { permissionIds, ...roleData } = parsed.data;

  const [role] = await db.insert(schema.roles).values({
    orgId,
    ...roleData,
  }).returning();

  if (permissionIds?.length) {
    await db.insert(schema.rolePermissions).values(
      permissionIds.map(permissionId => ({
        roleId: role.id,
        permissionId,
      })),
    );
  }

  return c.json(role, 201);
});

// GET /orgs/:orgId/roles
orgs.get('/:orgId/roles', async (c) => {
  const orgId = c.req.param('orgId');
  const roleList = await db.query.roles.findMany({
    where: eq(schema.roles.orgId, orgId),
  });
  return c.json(roleList);
});

export { orgs };
