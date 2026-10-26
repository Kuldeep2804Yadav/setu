import { z } from 'zod';
import { SiteStatus } from '../constants/index.js';

export const CreateSiteSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Site name must be at least 2 characters')
    .max(120, 'Site name must be at most 120 characters'),
  code: z
    .string()
    .trim()
    .min(2, 'Site code must be at least 2 characters')
    .max(20, 'Site code must be at most 20 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Site code can only contain letters, numbers, hyphens, and underscores')
    .transform((val) => val.toUpperCase()),
  location: z.string().trim().max(250).optional().or(z.literal('')),
  clientName: z.string().trim().max(120).optional().or(z.literal('')),
  supervisorIds: z.array(z.string().uuid()).optional().default([]),
});

export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;

export const UpdateSiteSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Site name must be at least 2 characters')
    .max(120)
    .optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((val) => val.toUpperCase())
    .optional(),
  location: z.string().trim().max(250).optional().or(z.literal('')),
  clientName: z.string().trim().max(120).optional().or(z.literal('')),
  status: z.enum([SiteStatus.ACTIVE, SiteStatus.ARCHIVED]).optional(),
});

export type UpdateSiteInput = z.infer<typeof UpdateSiteSchema>;

export const AssignSupervisorsSchema = z.object({
  supervisorIds: z.array(z.string().uuid()),
});

export type AssignSupervisorsInput = z.infer<typeof AssignSupervisorsSchema>;

export const SiteQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum([SiteStatus.ACTIVE, SiteStatus.ARCHIVED]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type SiteQueryInput = z.infer<typeof SiteQuerySchema>;
