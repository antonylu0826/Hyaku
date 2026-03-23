import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

/**
 * RBAC 權限引擎
 *
 * 檢查邏輯：
 * 1. 超級管理員 (isSuperAdmin) → 自動通過
 * 2. 查詢使用者在指定組織中的所有角色
 * 3. 檢查這些角色是否擁有所需的 resource:action 權限
 */
export async function checkPermission(
  userId: string,
  orgId: string,
  resource: string,
  action: string,
): Promise<boolean> {
  // 1. 檢查是否為超級管理員
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user || !user.isActive) return false;
  if (user.isSuperAdmin) return true;

  // 2. 找出使用者在這個組織的成員身份
  const member = await db.query.orgMembers.findFirst({
    where: and(
      eq(schema.orgMembers.userId, userId),
      eq(schema.orgMembers.orgId, orgId),
    ),
  });

  if (!member) return false;

  // 3. 找出該成員的所有角色對應的權限
  const memberRoleRows = await db
    .select({ permissionId: schema.rolePermissions.permissionId })
    .from(schema.memberRoles)
    .innerJoin(schema.rolePermissions, eq(schema.memberRoles.roleId, schema.rolePermissions.roleId))
    .where(eq(schema.memberRoles.memberId, member.id));

  if (memberRoleRows.length === 0) return false;

  // 4. 檢查是否有匹配的權限
  const permissionIds = memberRoleRows.map(r => r.permissionId);
  const matchingPermission = await db.query.permissions.findFirst({
    where: and(
      eq(schema.permissions.resource, resource),
      eq(schema.permissions.action, action),
    ),
  });

  if (!matchingPermission) return false;

  return permissionIds.includes(matchingPermission.id);
}

/**
 * 取得使用者在指定組織中的所有權限
 */
export async function getUserPermissions(
  userId: string,
  orgId: string,
): Promise<{ resource: string; action: string }[]> {
  const member = await db.query.orgMembers.findFirst({
    where: and(
      eq(schema.orgMembers.userId, userId),
      eq(schema.orgMembers.orgId, orgId),
    ),
  });

  if (!member) return [];

  const results = await db
    .select({
      resource: schema.permissions.resource,
      action: schema.permissions.action,
    })
    .from(schema.memberRoles)
    .innerJoin(schema.rolePermissions, eq(schema.memberRoles.roleId, schema.rolePermissions.roleId))
    .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
    .where(eq(schema.memberRoles.memberId, member.id));

  return results;
}
