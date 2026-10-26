import { z } from 'zod';

export const RegisterSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, 'Organization name must be at least 2 characters')
    .max(100, 'Organization name must be at most 100 characters'),
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
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
    .max(100, 'Password must be at most 100 characters'),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .toLowerCase(),
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be at most 100 characters'),
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
