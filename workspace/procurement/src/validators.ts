import { z } from 'zod';

const prItemSchema = z.object({
  lineNumber: z.number().int().min(1),
  productId: z.string().uuid().optional(),
  productCode: z.string().max(100).optional(),
  productName: z.string().min(1).max(255),
  specification: z.string().max(2000).optional(),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, '數量格式不正確'),
  unit: z.string().max(50).optional(),
  estimatedPrice: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  currency: z.string().length(3).default('TWD'),
  notes: z.string().max(1000).optional(),
});

export const createPrSchema = z.object({
  title: z.string().min(1).max(500),
  departmentId: z.string().uuid().optional(),
  requiredDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(prItemSchema).min(1, '至少需要一個品項'),
});

export const updatePrSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  requiredDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const approvePrSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(1000).optional(),
});

const poItemSchema = z.object({
  lineNumber: z.number().int().min(1),
  prItemId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  productCode: z.string().max(100).optional(),
  productName: z.string().min(1).max(255),
  specification: z.string().max(2000).optional(),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/),
  unit: z.string().max(50).optional(),
  unitPrice: z.string().regex(/^\d+(\.\d{1,4})?$/),
  currency: z.string().length(3).default('TWD'),
  notes: z.string().max(1000).optional(),
});

export const createPoSchema = z.object({
  prId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  supplierName: z.string().min(1).max(255),
  supplierCode: z.string().min(1).max(50),
  expectedDeliveryDate: z.string().datetime().optional(),
  deliveryAddress: z.string().max(1000).optional(),
  paymentTerms: z.string().max(255).optional(),
  currency: z.string().length(3).default('TWD'),
  notes: z.string().max(2000).optional(),
  items: z.array(poItemSchema).min(1, '至少需要一個品項'),
});

export const updatePoStatusSchema = z.object({
  status: z.enum(['sent', 'confirmed', 'partial', 'received', 'cancelled']),
  notes: z.string().max(1000).optional(),
});

export const receiveItemsSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().uuid(),
    receivedQuantity: z.string().regex(/^\d+(\.\d{1,4})?$/),
  })).min(1),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().max(50).optional(),
  requesterId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
});
