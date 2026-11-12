import { z } from "zod";
import { dateOnly, decimal } from "./calculation.js";

export const id = z.string().uuid();
export const amount = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/)
  .refine((v) => decimal(v).gt(0), "Amount must be positive");
export const date = z.string().refine((v) => {
  try {
    dateOnly(v);
    return true;
  } catch {
    return false;
  }
}, "Valid YYYY-MM-DD date required");
export const reason = z.string().trim().min(5).max(500);
const method = z.enum(["CASH", "UPI", "BANK_TRANSFER"]);
export const periodSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    startDate: date,
    endDate: date,
    frequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY", "CUSTOM"]),
    siteId: id.optional(),
    workerId: id.optional(),
    recoveries: z
      .array(z.object({ advanceId: id, amount }).strict())
      .max(500)
      .default([]),
  })
  .strict()
  .refine(
    (v) =>
      v.startDate <= v.endDate &&
      dateOnly(v.endDate).getTime() - dateOnly(v.startDate).getTime() <=
        366 * 86400000,
    "Payroll period must be ordered and at most 367 days",
  );
export const advanceSchema = z
  .object({
    workerId: id,
    siteId: id,
    amount,
    date,
    method,
    reference: z.string().trim().min(2).max(120),
  })
  .strict();
export const paymentSchema = z
  .object({
    payrollItemId: id,
    amount,
    date,
    method,
    reference: z.string().trim().min(2).max(120),
  })
  .strict();
export const confirmationSchema = z
  .object({ manuallyConfirmed: z.literal(true) })
  .strict();
export const reversalSchema = z.object({ reason }).strict();
export const adjustmentSchema = z
  .object({
    workerId: id,
    siteId: id,
    date,
    amount,
    type: z.enum(["BONUS", "DEDUCTION"]),
    reason,
    correctsPayrollId: id.optional(),
  })
  .strict();
export const rateSchema = z
  .object({
    workerId: id,
    type: z.enum(["DAILY", "HOURLY", "WEEKLY", "MONTHLY"]),
    amount,
    effectiveFrom: date,
  })
  .strict();
export const supplementSchema = z
  .object({
    attendanceId: id,
    paidLeave: z.boolean(),
    overtimeHours: z
      .string()
      .regex(/^\d{1,2}(\.\d{1,2})?$/)
      .refine((v) => decimal(v).lte(24)),
    overtimeRate: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
    reason,
  })
  .strict()
  .refine(
    (v) => decimal(v.overtimeHours).isZero() || decimal(v.overtimeRate).gt(0),
    "Overtime requires a positive rate",
  );
export const settingsSchema = z
  .object({
    periodAbsenceRule: z.enum(["UNPAID", "PAID"]).default("UNPAID"),
    paidLeave: z.boolean(),
    monthlyDivisor: z.union([
      z.literal("CALENDAR_MONTH"),
      z.string().regex(/^(?:[1-9]|[12][0-9]|3[01])$/),
    ]),
    weeklyDivisor: z.string().regex(/^[1-7]$/),
    paidLeaveHours: z.string().regex(/^(?:[1-9]|1[0-9]|2[0-4])$/),
    accountantCanApprove: z.boolean(),
  })
  .strict();
export const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    workerId: id.optional(),
    siteId: id.optional(),
    status: z.string().max(30).optional(),
    startDate: date.optional(),
    endDate: date.optional(),
  })
  .strict()
  .refine(
    (v) => !v.startDate || !v.endDate || v.startDate <= v.endDate,
    "Invalid date range",
  );
export type PeriodInput = z.infer<typeof periodSchema>;
export type ListInput = z.infer<typeof listSchema>;
