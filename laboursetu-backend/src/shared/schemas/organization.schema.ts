import { z } from 'zod';
import { Role } from '../constants/index.js';

export const UpdateOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Organization name must be at least 2 characters')
    .max(100, 'Organization name must be at most 100 characters')
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(250).optional().or(z.literal('')),
  gstin: z
    .string()
    .trim()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      'Please enter a valid Indian GSTIN number'
    )
    .optional()
    .or(z.literal('')),
  currency: z.string().trim().default('INR'),
});

export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;

export const AddTeamMemberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number')
    .optional()
    .or(z.literal('')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100),
  role: z.enum([Role.ACCOUNTANT, Role.SUPERVISOR], {
    errorMap: () => ({ message: 'Role must be either ACCOUNTANT or SUPERVISOR' }),
  }),
});

export type AddTeamMemberInput = z.infer<typeof AddTeamMemberSchema>;

export const UpdateTeamMemberSchema = z.object({
  role: z.enum([Role.ACCOUNTANT, Role.SUPERVISOR]).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateTeamMemberInput = z.infer<typeof UpdateTeamMemberSchema>;
