import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/, '代碼只能包含大寫字母、數字、底線和連字號'),
  taxId: z.string().max(20).optional(),
  address: z.string().max(1000).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(255).optional(),
  website: z.string().url().max(500).optional(),
  paymentTerms: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateSupplierSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  taxId: z.string().max(20).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  website: z.string().url().max(500).nullable().optional(),
  paymentTerms: z.string().max(255).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createContactSchema = z.object({
  name: z.string().min(1).max(255),
  title: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(255).optional(),
  isPrimary: z.boolean().default(false),
});

export const updateContactSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  title: z.string().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  isPrimary: z.boolean().optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(255).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
