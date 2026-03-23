import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/, '代碼只能包含大寫字母、數字、底線和連字號'),
  parentId: z.string().uuid().optional(),
  description: z.string().max(1000).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const createUnitSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/, '單位代碼只能包含大寫字母和數字'),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(100),
  categoryId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  description: z.string().max(2000).optional(),
  specification: z.string().max(2000).optional(),
  referencePrice: z.string().regex(/^\d+(\.\d{1,4})?$/, '價格格式不正確').optional(),
  currency: z.string().length(3).default('TWD'),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
  specification: z.string().max(2000).optional(),
  referencePrice: z.string().regex(/^\d+(\.\d{1,4})?$/).nullable().optional(),
  currency: z.string().length(3).optional(),
  isActive: z.boolean().optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
