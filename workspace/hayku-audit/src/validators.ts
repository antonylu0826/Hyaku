import { z } from 'zod';

export const createEventSchema = z.object({
  actorId: z.string().min(1),
  actorType: z.enum(['user', 'service', 'system']),
  actorEmail: z.string().email().optional(),
  action: z.string().min(1),
  outcome: z.enum(['success', 'failure', 'error']).default('success'),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  service: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  description: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

export const batchCreateSchema = z.object({
  events: z.array(createEventSchema).min(1).max(1000),
});

export const queryEventsSchema = z.object({
  actorId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  service: z.string().optional(),
  outcome: z.enum(['success', 'failure', 'error']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
