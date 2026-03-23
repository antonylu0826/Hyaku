import { z } from 'zod';

// Auth
export const registerSchema = z.object({
  email: z.string().email('無效的 Email 格式').max(255),
  password: z.string().min(8, '密碼至少 8 個字元').max(128),
  displayName: z.string().min(1, '顯示名稱不可為空').max(255),
});

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().max(128),
});

// Organization
export const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, 'slug 只能包含小寫字母、數字和連字號'),
  description: z.string().max(2000).optional(),
});

// Department
export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  parentId: z.string().uuid().optional(),
});

// Role
export const createRoleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  permissionIds: z.array(z.string().uuid()).max(100).optional(),
});

// Permission
export const createPermissionSchema = z.object({
  resource: z.string().min(1).max(255),
  action: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});

// Member
export const addMemberSchema = z.object({
  userId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  roleIds: z.array(z.string().uuid()).max(50).optional(),
});

// Permission check
export const checkPermissionSchema = z.object({
  resource: z.string().min(1).max(255),
  action: z.string().min(1).max(255),
});

// Password reset
export const requestResetSchema = z.object({
  email: z.string().email().max(255),
});

export const executeResetSchema = z.object({
  token: z.string().min(1).max(255),
  newPassword: z.string().min(8, '密碼至少 8 個字元').max(128),
});
