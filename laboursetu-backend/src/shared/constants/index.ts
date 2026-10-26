export const Role = {
  OWNER: 'OWNER',
  ACCOUNTANT: 'ACCOUNTANT',
  SUPERVISOR: 'SUPERVISOR',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const SiteStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export type SiteStatus = (typeof SiteStatus)[keyof typeof SiteStatus];

export const WorkerStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export type WorkerStatus = (typeof WorkerStatus)[keyof typeof WorkerStatus];

export const VerificationStatus = {
  UNVERIFIED: 'UNVERIFIED',
  AADHAAR_SUBMITTED: 'AADHAAR_SUBMITTED',
  VERIFIED: 'VERIFIED',
} as const;

export type VerificationStatus =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const WageType = {
  DAILY: 'DAILY',
  HOURLY: 'HOURLY',
} as const;

export type WageType = (typeof WageType)[keyof typeof WageType];

export const AssignmentStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
} as const;

export type AssignmentStatus =
  (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  HALF_DAY: 'HALF_DAY',
  ABSENT: 'ABSENT',
} as const;

export type AttendanceStatus =
  (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const SubmissionStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type SubmissionStatus =
  (typeof SubmissionStatus)[keyof typeof SubmissionStatus];

export const CorrectionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type CorrectionStatus =
  (typeof CorrectionStatus)[keyof typeof CorrectionStatus];

export const WageEntryStatus = {
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
  REVERSED: 'REVERSED',
} as const;

export type WageEntryStatus =
  (typeof WageEntryStatus)[keyof typeof WageEntryStatus];

export const TRADES = [
  'Helper',
  'Mason',
  'Carpenter',
  'Bar Bender',
  'Electrician',
  'Plumber',
  'Painter',
  'Welder',
  'Tile Mistri',
  'Excavator Operator',
  'Crane Operator',
  'Driver',
  'Security Guard',
  'Other',
] as const;

export type Trade = (typeof TRADES)[number];

export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  DUPLICATE_WORKER: 'DUPLICATE_WORKER',
  DUPLICATE_CODE: 'DUPLICATE_CODE',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  CSRF_INVALID: 'CSRF_INVALID',
  FUTURE_DATE_NOT_ALLOWED: 'FUTURE_DATE_NOT_ALLOWED',
  INELIGIBLE_WORKER: 'INELIGIBLE_WORKER',
  DUPLICATE_ATTENDANCE: 'DUPLICATE_ATTENDANCE',
  SUBMISSION_NOT_FOUND: 'SUBMISSION_NOT_FOUND',
  CANNOT_APPROVE_OWN_SUBMISSION: 'CANNOT_APPROVE_OWN_SUBMISSION',
  CANNOT_APPROVE_OWN_CORRECTION: 'CANNOT_APPROVE_OWN_CORRECTION',
  SUBMISSION_FROZEN: 'SUBMISSION_FROZEN',
  INCOMPLETE_ROSTER: 'INCOMPLETE_ROSTER',
  MISSING_WAGE_RATE: 'MISSING_WAGE_RATE',
  INVALID_HOURS: 'INVALID_HOURS',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  ALREADY_APPROVED: 'ALREADY_APPROVED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
