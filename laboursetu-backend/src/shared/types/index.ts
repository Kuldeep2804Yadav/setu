import {
  Role,
  SiteStatus,
  WorkerStatus,
  VerificationStatus,
  WageType,
  AssignmentStatus,
  AttendanceStatus,
  SubmissionStatus,
  CorrectionStatus,
  WageEntryStatus,
  ErrorCode,
} from '../constants/index.js';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode | string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

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

export interface RosterWorker {
  id: string;
  code: string;
  name: string;
  trade: string;
  mobileNumber: string | null;
  verificationStatus: VerificationStatus;
  status: WorkerStatus;
  isEligible: boolean;
  ineligibilityReason?: string;
  applicableWageRate: {
    id: string;
    wageType: WageType;
    rate: number;
    effectiveFrom: string;
  } | null;
  currentAttendance?: {
    id: string;
    status: AttendanceStatus;
    hoursWorked: number | null;
    payableUnits: number;
    notes: string | null;
    isCorrected: boolean;
  } | null;
}

export interface AttendanceSubmissionDetail {
  id: string;
  organizationId: string;
  siteId: string;
  site: {
    id: string;
    name: string;
    code: string;
    location: string | null;
  };
  attendanceDate: string;
  status: SubmissionStatus;
  submittedByUser: { id: string; name: string; role: Role } | null;
  submittedAt: string | null;
  approvedByUser: { id: string; name: string; role: Role } | null;
  approvedAt: string | null;
  rejectedByUser: { id: string; name: string; role: Role } | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  rosterSummary: {
    totalEligible: number;
    totalEntered: number;
    isComplete: boolean;
    hasMissingWageRates: boolean;
    presentCount: number;
    halfDayCount: number;
    absentCount: number;
    totalCalculatedWage: number;
  };
  attendances: Array<{
    id: string;
    workerId: string;
    worker: {
      id: string;
      code: string;
      name: string;
      trade: string;
      mobileNumber: string | null;
      verificationStatus: VerificationStatus;
    };
    status: AttendanceStatus;
    hoursWorked: number | null;
    payableUnits: number;
    notes: string | null;
    isCorrected: boolean;
    wageRate: {
      id: string;
      wageType: WageType;
      rate: number;
    } | null;
    calculatedWage: number;
  }>;
}

export interface WageRegisterItem {
  id: string;
  attendanceId: string;
  workerId: string;
  workerName: string;
  workerCode: string;
  trade: string;
  siteId: string;
  siteName: string;
  siteCode: string;
  attendanceDate: string;
  attendanceStatus: AttendanceStatus;
  wageType: WageType;
  rate: number;
  payableUnits: number;
  hoursWorked: number | null;
  grossWage: number;
  status: WageEntryStatus;
  approvedAt: string;
  approvedByName: string;
}

export interface WageRegisterSummary {
  period: {
    startDate?: string;
    endDate?: string;
  };
  totals: {
    totalWorkers: number;
    totalSites: number;
    totalPresentUnits: number;
    totalHoursWorked: number;
    totalGrossWage: number;
  };
  entries: WageRegisterItem[];
}
