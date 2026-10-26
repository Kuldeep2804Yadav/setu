import { z } from 'zod';
import {
  VerificationStatus,
  WageType,
  WorkerStatus,
} from '../constants/index.js';

export const CreateWageRateSchema = z.object({
  wageType: z.enum([WageType.DAILY, WageType.HOURLY]),
  rate: z
    .coerce
    .number()
    .positive('Wage rate must be greater than zero')
    .max(100000, 'Wage rate must be realistic'),
  effectiveFrom: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .or(z.date())
    .transform((val) => (val instanceof Date ? val : new Date(val))),
  effectiveTo: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .or(z.date())
    .optional()
    .nullable()
    .transform((val) => (val ? (val instanceof Date ? val : new Date(val)) : null)),
  notes: z.string().trim().max(250).optional().or(z.literal('')),
});

export type CreateWageRateInput = z.infer<typeof CreateWageRateSchema>;

export const CreateWorkerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Worker name must be at least 2 characters')
    .max(100, 'Worker name must be at most 100 characters'),
  code: z
    .string()
    .trim()
    .min(2, 'Worker code must be at least 2 characters')
    .max(30, 'Worker code must be at most 30 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Worker code can only contain letters, numbers, hyphens, and underscores')
    .transform((val) => val.toUpperCase())
    .optional(), // If omitted, backend auto-generates WRK-XXX
  mobileNumber: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number')
    .optional()
    .nullable()
    .or(z.literal('')),
  trade: z
    .string()
    .trim()
    .min(2, 'Trade must be at least 2 characters')
    .max(50),
  verificationStatus: z
    .enum([
      VerificationStatus.UNVERIFIED,
      VerificationStatus.AADHAAR_SUBMITTED,
      VerificationStatus.VERIFIED,
    ])
    .default(VerificationStatus.UNVERIFIED),
  aadhaarLastFour: z
    .string()
    .trim()
    .length(4, 'Last 4 digits of Aadhaar must be exactly 4 digits')
    .regex(/^\d{4}$/, 'Must be numeric')
    .optional()
    .nullable()
    .or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
  // Initial site assignment
  initialSiteId: z.string().uuid().optional().nullable().or(z.literal('')),
  // Initial wage rate
  initialWage: z
    .object({
      wageType: z.enum([WageType.DAILY, WageType.HOURLY]),
      rate: z
        .coerce
        .number()
        .positive('Wage rate must be greater than zero')
        .max(100000),
      effectiveFrom: z
        .string()
        .or(z.date())
        .optional()
        .transform((val) => (val ? (val instanceof Date ? val : new Date(val)) : new Date())),
      notes: z.string().trim().max(250).optional().or(z.literal('')),
    })
    .optional(),
});

export type CreateWorkerInput = z.infer<typeof CreateWorkerSchema>;

export const UpdateWorkerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Worker name must be at least 2 characters')
    .max(100)
    .optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((val) => val.toUpperCase())
    .optional(),
  mobileNumber: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number')
    .optional()
    .nullable()
    .or(z.literal('')),
  trade: z.string().trim().min(2).max(50).optional(),
  verificationStatus: z
    .enum([
      VerificationStatus.UNVERIFIED,
      VerificationStatus.AADHAAR_SUBMITTED,
      VerificationStatus.VERIFIED,
    ])
    .optional(),
  aadhaarLastFour: z
    .string()
    .trim()
    .length(4)
    .regex(/^\d{4}$/)
    .optional()
    .nullable()
    .or(z.literal('')),
  status: z
    .enum([WorkerStatus.ACTIVE, WorkerStatus.INACTIVE, WorkerStatus.ARCHIVED])
    .optional(),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export type UpdateWorkerInput = z.infer<typeof UpdateWorkerSchema>;

export const AssignWorkerSiteSchema = z.object({
  siteId: z.string().uuid('Valid site ID required'),
  startDate: z
    .string()
    .or(z.date())
    .optional()
    .transform((val) => (val ? (val instanceof Date ? val : new Date(val)) : new Date())),
  endDate: z
    .string()
    .or(z.date())
    .optional()
    .nullable()
    .transform((val) => (val ? (val instanceof Date ? val : new Date(val)) : null)),
  notes: z.string().trim().max(250).optional().or(z.literal('')),
});

export type AssignWorkerSiteInput = z.infer<typeof AssignWorkerSiteSchema>;

export const WorkerQuerySchema = z.object({
  search: z.string().trim().optional(),
  trade: z.string().trim().optional(),
  siteId: z.string().uuid().optional(),
  status: z
    .enum([WorkerStatus.ACTIVE, WorkerStatus.INACTIVE, WorkerStatus.ARCHIVED])
    .optional(),
  verificationStatus: z
    .enum([
      VerificationStatus.UNVERIFIED,
      VerificationStatus.AADHAAR_SUBMITTED,
      VerificationStatus.VERIFIED,
    ])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type WorkerQueryInput = z.infer<typeof WorkerQuerySchema>;
