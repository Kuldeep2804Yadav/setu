import { z } from 'zod';
import {
  AttendanceStatus,
  SubmissionStatus,
  CorrectionStatus,
} from '../constants/index.js';

export const DateStringRegex = /^\d{4}-\d{2}-\d{2}$/;

export const AttendanceItemInputSchema = z.object({
  workerId: z.string().uuid('Valid worker ID required'),
  status: z.enum([
    AttendanceStatus.PRESENT,
    AttendanceStatus.HALF_DAY,
    AttendanceStatus.ABSENT,
  ]),
  hoursWorked: z
    .coerce
    .number()
    .min(0.01, 'Hours worked must be greater than zero')
    .max(24.0, 'Hours worked cannot exceed 24 in a single day')
    .refine(
      (val) => {
        // At most two decimal places
        const parts = val.toString().split('.');
        return !parts[1] || parts[1].length <= 2;
      },
      { message: 'Hours worked cannot have more than 2 decimal places' }
    )
    .optional()
    .nullable(),
  notes: z.string().trim().max(300).optional().nullable().or(z.literal('')),
});

export type AttendanceItemInput = z.infer<typeof AttendanceItemInputSchema>;

export const BulkSaveAttendanceSchema = z.object({
  entries: z.array(AttendanceItemInputSchema).min(1, 'At least one worker entry is required'),
});

export type BulkSaveAttendanceInput = z.infer<typeof BulkSaveAttendanceSchema>;

export const CreateSubmissionSchema = z.object({
  siteId: z.string().uuid('Valid site ID required'),
  attendanceDate: z
    .string()
    .regex(DateStringRegex, 'Attendance date must be in YYYY-MM-DD format'),
});

export type CreateSubmissionInput = z.infer<typeof CreateSubmissionSchema>;

export const RejectSubmissionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Rejection reason must be at least 3 characters')
    .max(500, 'Rejection reason must be at most 500 characters'),
});

export type RejectSubmissionInput = z.infer<typeof RejectSubmissionSchema>;

export const CreateCorrectionSchema = z.object({
  newStatus: z.enum([
    AttendanceStatus.PRESENT,
    AttendanceStatus.HALF_DAY,
    AttendanceStatus.ABSENT,
  ]),
  newHoursWorked: z
    .coerce
    .number()
    .min(0.01, 'Hours worked must be greater than zero')
    .max(24.0, 'Hours worked cannot exceed 24')
    .refine(
      (val) => {
        const parts = val.toString().split('.');
        return !parts[1] || parts[1].length <= 2;
      },
      { message: 'Hours worked cannot have more than 2 decimal places' }
    )
    .optional()
    .nullable(),
  reason: z
    .string()
    .trim()
    .min(5, 'Correction reason must be at least 5 characters')
    .max(1000, 'Correction reason must be at most 1000 characters'),
});

export type CreateCorrectionInput = z.infer<typeof CreateCorrectionSchema>;

export const ReviewCorrectionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reviewNotes: z.string().trim().max(500).optional().or(z.literal('')),
});

export type ReviewCorrectionInput = z.infer<typeof ReviewCorrectionSchema>;

export const SubmissionQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  status: z
    .enum([
      SubmissionStatus.DRAFT,
      SubmissionStatus.SUBMITTED,
      SubmissionStatus.APPROVED,
      SubmissionStatus.REJECTED,
    ])
    .optional(),
  startDate: z.string().regex(DateStringRegex).optional(),
  endDate: z.string().regex(DateStringRegex).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type SubmissionQueryInput = z.infer<typeof SubmissionQuerySchema>;

export const AttendanceQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  workerId: z.string().uuid().optional(),
  status: z
    .enum([
      AttendanceStatus.PRESENT,
      AttendanceStatus.HALF_DAY,
      AttendanceStatus.ABSENT,
    ])
    .optional(),
  startDate: z.string().regex(DateStringRegex).optional(),
  endDate: z.string().regex(DateStringRegex).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type AttendanceQueryInput = z.infer<typeof AttendanceQuerySchema>;

export const WageRegisterQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  workerId: z.string().uuid().optional(),
  startDate: z.string().regex(DateStringRegex).optional(),
  endDate: z.string().regex(DateStringRegex).optional(),
  groupBy: z.enum(['WORKER', 'SITE', 'DATE']).optional().default('WORKER'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type WageRegisterQueryInput = z.infer<typeof WageRegisterQuerySchema>;
