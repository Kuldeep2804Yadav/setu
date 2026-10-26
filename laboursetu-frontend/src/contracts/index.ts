// Public API contracts; backend is authoritative. See CONTRACTS.md.
export const Role = {
  OWNER: 'OWNER',
  ACCOUNTANT: 'ACCOUNTANT',
  SUPERVISOR: 'SUPERVISOR',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

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

export interface AuthUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  organization: {
    id: string;
    name: string;
    slug: string;
    code: string;
    currency: string;
    gstin?: string | null;
    phone?: string | null;
    address?: string | null;
  };
}

export interface DashboardMetrics {
  totalWorkers: number;
  activeWorkers: number;
  activeSites: number;
  totalSupervisors: number;
  recentWorkers: Array<{
    id: string;
    code: string;
    name: string;
    trade: string;
    mobileNumber: string | null;
    status: WorkerStatus;
    verificationStatus: VerificationStatus;
    createdAt: string;
    activeSiteName?: string | null;
    currentWageRate?: number | null;
  }>;
  tradeDistribution: Array<{
    trade: string;
    count: number;
  }>;
}


export interface LoginInput { email: string; password: string; }
export interface RegisterInput extends LoginInput { organizationName: string; name: string; phone?: string; }
