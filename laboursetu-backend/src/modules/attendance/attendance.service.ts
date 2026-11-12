import {
  prisma,
  Role,
  AttendanceStatus,
  SubmissionStatus,
  CorrectionStatus,
  WageEntryStatus,
  WageType,
  WorkerStatus,
  SiteStatus,
  Prisma,
} from '../../database/index.js';
import {
  BulkSaveAttendanceInput,
  CreateSubmissionInput,
  RejectSubmissionInput,
  CreateCorrectionInput,
  ReviewCorrectionInput,
  SubmissionQueryInput,
  AttendanceQueryInput,
  ErrorCode,
  RosterWorker,
  AttendanceSubmissionDetail,
} from '../../shared/index.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from '../../utils/errors.js';
import {
  getTodayIST,
  isFutureDateIST,
  parseDateOnly,
  formatDateOnly,
} from '../../utils/date.js';
import {
  calculateGrossWage,
  roundHalfUp,
} from '../../utils/wage.js';
import { logAudit } from '../../utils/audit.js';
import { sourceTransaction } from '../payroll/finance.repository.js';

export class AttendanceService {
  /**
   * Helper: verify supervisor permission for the given site
   */
  async verifySupervisorSiteAccess(
    organizationId: string,
    siteId: string,
    userId: string,
    role: Role
  ): Promise<void> {
    if (role === Role.SUPERVISOR) {
      const assignment = await prisma.supervisorSite.findFirst({
        where: {
          siteId,
          userId,
        },
      });

      if (!assignment) {
        throw new ForbiddenError(
          'Supervisors can only record or submit attendance for their assigned sites.',
          ErrorCode.FORBIDDEN
        );
      }
    }
  }

  /**
   * Get eligible worker roster for a site and attendance date
   */
  async getRoster(
    organizationId: string,
    siteId: string,
    attendanceDateStr: string,
    actorUserId: string,
    actorRole: Role
  ): Promise<{
    site: { id: string; name: string; code: string; status: SiteStatus };
    attendanceDate: string;
    todayIST: string;
    isFutureDate: boolean;
    workers: RosterWorker[];
  }> {
    if (isFutureDateIST(attendanceDateStr)) {
      throw new BadRequestError(
        'Cannot view or enter attendance for future dates.',
        ErrorCode.FUTURE_DATE_NOT_ALLOWED
      );
    }

    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site not found in your organization.');
    }

    await this.verifySupervisorSiteAccess(organizationId, siteId, actorUserId, actorRole);

    const targetDate = parseDateOnly(attendanceDateStr);
    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));

    // Historical site check: if site is archived, was it archived on or before attendance date?
    if (site.status === SiteStatus.ARCHIVED && site.archivedAt && site.archivedAt <= dayStart) {
      throw new BadRequestError('Site was already archived prior to this attendance date.');
    }

    // 1. Query all workers in organization with their historical assignments and wage rates
    const allWorkers = await prisma.worker.findMany({
      where: { organizationId },
      include: {
        siteAssignments: {
          where: {
            siteId,
            startDate: { lte: dayEnd },
            OR: [
              { endDate: null },
              { endDate: { gt: dayStart } }, // Exclusive end
            ],
          },
          orderBy: { startDate: 'desc' },
        },
        wageRates: {
          where: {
            effectiveFrom: { lte: dayEnd },
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
        attendances: {
          where: {
            attendanceDate: targetDate,
          },
          include: {
            submission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const roster: RosterWorker[] = allWorkers.map((w) => {
      // Worker assignment check: inclusive start, exclusive end
      const hasValidAssignment = w.siteAssignments.length > 0;

      // Historical worker archived check:
      // Allow historical attendance for archived workers ONLY when they were eligible on that date.
      const isArchivedBeforeDate =
        w.status === WorkerStatus.ARCHIVED &&
        w.archivedAt !== null &&
        w.archivedAt <= dayStart;

      let isEligible = hasValidAssignment && !isArchivedBeforeDate;
      let ineligibilityReason: string | undefined;

      if (!hasValidAssignment) {
        isEligible = false;
        ineligibilityReason = 'No active site assignment covering this date.';
      } else if (isArchivedBeforeDate) {
        isEligible = false;
        ineligibilityReason = 'Worker was already archived prior to this date.';
      }

      const applicableRate = w.wageRates[0]
        ? {
            id: w.wageRates[0].id,
            wageType: w.wageRates[0].wageType as WageType,
            rate: Number(w.wageRates[0].rate),
            effectiveFrom: formatDateOnly(w.wageRates[0].effectiveFrom),
          }
        : null;

      const att = w.attendances[0];
      const currentAttendance = att
        ? {
            id: att.id,
            status: att.status as AttendanceStatus,
            hoursWorked: att.hoursWorked ? Number(att.hoursWorked) : null,
            payableUnits: Number(att.payableUnits),
            notes: att.notes,
            isCorrected: att.isCorrected,
          }
        : null;

      return {
        id: w.id,
        code: w.code,
        name: w.name,
        trade: w.trade,
        mobileNumber: w.mobileNumber,
        verificationStatus: w.verificationStatus,
        status: w.status,
        isEligible,
        ineligibilityReason,
        applicableWageRate: applicableRate,
        currentAttendance,
      };
    });

    return {
      site: {
        id: site.id,
        name: site.name,
        code: site.code,
        status: site.status,
      },
      attendanceDate: attendanceDateStr,
      todayIST: getTodayIST(),
      isFutureDate: false,
      workers: roster,
    };
  }

  /**
   * Get or create a draft AttendanceSubmission for a site and date
   */
  async getOrCreateSubmission(
    organizationId: string,
    siteId: string,
    attendanceDateStr: string,
    actorUserId: string,
    actorRole: Role
  ): Promise<AttendanceSubmissionDetail> {
    if (isFutureDateIST(attendanceDateStr)) {
      throw new BadRequestError(
        'Cannot create or access attendance submission for future dates.',
        ErrorCode.FUTURE_DATE_NOT_ALLOWED
      );
    }

    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site not found in your organization.');
    }

    await this.verifySupervisorSiteAccess(organizationId, siteId, actorUserId, actorRole);

    const targetDate = parseDateOnly(attendanceDateStr);

    let submission = await prisma.attendanceSubmission.findUnique({
      where: {
        organizationId_siteId_attendanceDate: {
          organizationId,
          siteId,
          attendanceDate: targetDate,
        },
      },
    });

    if (!submission) {
      submission = await prisma.attendanceSubmission.create({
        data: {
          organizationId,
          siteId,
          attendanceDate: targetDate,
          status: SubmissionStatus.DRAFT,
          version: 1,
        },
      });

      await logAudit({
        organizationId,
        userId: actorUserId,
        action: 'ATTENDANCE_SUBMISSION_CREATED',
        entityType: 'AttendanceSubmission',
        entityId: submission.id,
        metadata: { siteId, attendanceDate: attendanceDateStr },
      });
    }

    return this.getSubmissionDetails(organizationId, submission.id, actorUserId, actorRole);
  }

  /**
   * Get submission details with attendance entries, roster completeness, and missing rate warnings
   */
  async getSubmissionDetails(
    organizationId: string,
    submissionId: string,
    actorUserId: string,
    actorRole: Role
  ): Promise<AttendanceSubmissionDetail> {
    const submission = await prisma.attendanceSubmission.findFirst({
      where: { id: submissionId, organizationId },
      include: {
        site: {
          select: { id: true, name: true, code: true, location: true },
        },
        submittedByUser: {
          select: { id: true, name: true, role: true },
        },
        approvedByUser: {
          select: { id: true, name: true, role: true },
        },
        rejectedByUser: {
          select: { id: true, name: true, role: true },
        },
        attendances: {
          include: {
            worker: {
              select: {
                id: true,
                code: true,
                name: true,
                trade: true,
                mobileNumber: true,
                verificationStatus: true,
                wageRates: {
                  orderBy: { effectiveFrom: 'desc' },
                },
              },
            },
          },
          orderBy: { worker: { name: 'asc' } },
        },
      },
    });

    if (!submission) {
      throw new NotFoundError('Attendance submission not found.');
    }

    await this.verifySupervisorSiteAccess(organizationId, submission.siteId, actorUserId, actorRole);

    const attendanceDateStr = formatDateOnly(submission.attendanceDate);
    const targetDate = submission.attendanceDate;
    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));

    // Count total eligible workers for this site & date
    const eligibleWorkers = await prisma.worker.findMany({
      where: {
        organizationId,
        siteAssignments: {
          some: {
            siteId: submission.siteId,
            startDate: { lte: dayEnd },
            OR: [
              { endDate: null },
              { endDate: { gt: dayStart } },
            ],
          },
        },
        OR: [
          { status: { not: WorkerStatus.ARCHIVED } },
          { archivedAt: { gt: dayStart } },
        ],
      },
      select: { id: true },
    });

    const totalEligible = eligibleWorkers.length;
    const totalEntered = submission.attendances.length;

    let presentCount = 0;
    let halfDayCount = 0;
    let absentCount = 0;
    let hasMissingWageRates = false;
    let totalCalculatedWage = new Prisma.Decimal('0.00');

    const formattedAttendances = submission.attendances.map((att) => {
      if (att.status === AttendanceStatus.PRESENT) presentCount++;
      else if (att.status === AttendanceStatus.HALF_DAY) halfDayCount++;
      else if (att.status === AttendanceStatus.ABSENT) absentCount++;

      // Find applicable rate: latest on or before attendance date
      const applicableRate = att.worker.wageRates.find(
        (r) => r.effectiveFrom <= dayEnd
      );

      let calculatedWage = new Prisma.Decimal('0.00');

      if (att.status !== AttendanceStatus.ABSENT) {
        if (!applicableRate) {
          hasMissingWageRates = true;
        } else {
          try {
            const result = calculateGrossWage(
              applicableRate.wageType,
              applicableRate.rate,
              att.status,
              att.hoursWorked
            );
            calculatedWage = result.grossWage;
            totalCalculatedWage = totalCalculatedWage.add(calculatedWage);
          } catch {
            hasMissingWageRates = true;
          }
        }
      }

      return {
        id: att.id,
        workerId: att.workerId,
        worker: {
          id: att.worker.id,
          code: att.worker.code,
          name: att.worker.name,
          trade: att.worker.trade,
          mobileNumber: att.worker.mobileNumber,
          verificationStatus: att.worker.verificationStatus,
        },
        status: att.status,
        hoursWorked: att.hoursWorked ? Number(att.hoursWorked) : null,
        payableUnits: Number(att.payableUnits),
        notes: att.notes,
        isCorrected: att.isCorrected,
        wageRate: applicableRate
          ? {
              id: applicableRate.id,
              wageType: applicableRate.wageType,
              rate: Number(applicableRate.rate),
            }
          : null,
        calculatedWage: Number(calculatedWage),
      };
    });

    const isComplete = totalEligible > 0 && totalEntered >= totalEligible;

    return {
      id: submission.id,
      organizationId: submission.organizationId,
      siteId: submission.siteId,
      site: submission.site,
      attendanceDate: attendanceDateStr,
      status: submission.status,
      submittedByUser: submission.submittedByUser
        ? { id: submission.submittedByUser.id, name: submission.submittedByUser.name, role: submission.submittedByUser.role as Role }
        : null,
      submittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : null,
      approvedByUser: submission.approvedByUser
        ? { id: submission.approvedByUser.id, name: submission.approvedByUser.name, role: submission.approvedByUser.role as Role }
        : null,
      approvedAt: submission.approvedAt ? submission.approvedAt.toISOString() : null,
      rejectedByUser: submission.rejectedByUser
        ? { id: submission.rejectedByUser.id, name: submission.rejectedByUser.name, role: submission.rejectedByUser.role as Role }
        : null,
      rejectedAt: submission.rejectedAt ? submission.rejectedAt.toISOString() : null,
      rejectionReason: submission.rejectionReason,
      version: submission.version,
      createdAt: submission.createdAt.toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
      rosterSummary: {
        totalEligible,
        totalEntered,
        isComplete,
        hasMissingWageRates,
        presentCount,
        halfDayCount,
        absentCount,
        totalCalculatedWage: Number(totalCalculatedWage),
      },
      attendances: formattedAttendances,
    };
  }

  /**
   * List submissions with query filters
   */
  async listSubmissions(
    organizationId: string,
    query: SubmissionQueryInput,
    actorUserId: string,
    actorRole: Role
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (query.siteId) {
      where.siteId = query.siteId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.attendanceDate = {};
      if (query.startDate) where.attendanceDate.gte = parseDateOnly(query.startDate);
      if (query.endDate) where.attendanceDate.lte = parseDateOnly(query.endDate);
    }

    // Supervisors only see their assigned sites
    if (actorRole === Role.SUPERVISOR) {
      const assigned = await prisma.supervisorSite.findMany({
        where: { userId: actorUserId },
        select: { siteId: true },
      });
      const allowedSiteIds = assigned.map((a) => a.siteId);
      where.siteId = { in: allowedSiteIds };
    }

    const [total, submissions] = await Promise.all([
      prisma.attendanceSubmission.count({ where }),
      prisma.attendanceSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ attendanceDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          site: {
            select: { id: true, name: true, code: true, location: true },
          },
          submittedByUser: {
            select: { id: true, name: true, role: true },
          },
          approvedByUser: {
            select: { id: true, name: true, role: true },
          },
          rejectedByUser: {
            select: { id: true, name: true, role: true },
          },
          _count: {
            select: { attendances: true },
          },
        },
      }),
    ]);

    const formatted = submissions.map((s) => ({
      id: s.id,
      siteId: s.siteId,
      site: s.site,
      attendanceDate: formatDateOnly(s.attendanceDate),
      status: s.status,
      submittedByUser: s.submittedByUser,
      submittedAt: s.submittedAt,
      approvedByUser: s.approvedByUser,
      approvedAt: s.approvedAt,
      rejectedByUser: s.rejectedByUser,
      rejectedAt: s.rejectedAt,
      rejectionReason: s.rejectionReason,
      attendanceCount: s._count.attendances,
      version: s.version,
    }));

    return {
      submissions: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Bulk save attendance draft entries for a submission
   */
  async saveDraftEntries(
    organizationId: string,
    submissionId: string,
    input: BulkSaveAttendanceInput,
    actorUserId: string,
    actorRole: Role
  ): Promise<AttendanceSubmissionDetail> {
    const submission = await prisma.attendanceSubmission.findFirst({
      where: { id: submissionId, organizationId },
    });

    if (!submission) {
      throw new NotFoundError('Attendance submission not found.');
    }

    // Freeze rule: approved or submitted submissions cannot be edited via draft save
    if (submission.status === SubmissionStatus.SUBMITTED) {
      throw new BadRequestError(
        'This submission is currently frozen and awaiting approval. Reject it to enable edits.',
        ErrorCode.SUBMISSION_FROZEN
      );
    }

    if (submission.status === SubmissionStatus.APPROVED) {
      throw new BadRequestError(
        'Approved attendance records cannot be edited directly. Use the correction workflow.',
        ErrorCode.ALREADY_APPROVED
      );
    }

    await this.verifySupervisorSiteAccess(organizationId, submission.siteId, actorUserId, actorRole);

    const targetDate = submission.attendanceDate;
    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));

    // Process all entries inside a transaction
    await sourceTransaction(organizationId, async (tx) => {
      for (const entry of input.entries) {
        // 1. Verify worker belongs to tenant
        const worker = await tx.worker.findFirst({
          where: { id: entry.workerId, organizationId },
          include: {
            siteAssignments: {
              where: {
                siteId: submission.siteId,
                startDate: { lte: dayEnd },
                OR: [
                  { endDate: null },
                  { endDate: { gt: dayStart } },
                ],
              },
            },
            wageRates: {
              where: { effectiveFrom: { lte: dayEnd } },
              orderBy: { effectiveFrom: 'desc' },
              take: 1,
            },
          },
        });

        if (!worker) {
          throw new NotFoundError(`Worker '${entry.workerId}' not found in your organization.`);
        }

        // 2. Eligibility check: must have valid assignment covering this date
        if (worker.siteAssignments.length === 0) {
          throw new BadRequestError(
            `Worker '${worker.name}' (${worker.code}) does not have an active site assignment for this date.`,
            ErrorCode.INELIGIBLE_WORKER
          );
        }

        // 3. Historical archived check: worker was archived prior to this date
        if (worker.status === WorkerStatus.ARCHIVED && worker.archivedAt && worker.archivedAt <= dayStart) {
          throw new BadRequestError(
            `Worker '${worker.name}' (${worker.code}) was already archived prior to this date.`,
            ErrorCode.INELIGIBLE_WORKER
          );
        }

        // 4. Validate entry against applicable wage type if rate exists
        const latestRate = worker.wageRates[0];
        let payableUnits = new Prisma.Decimal('0.00');
        let hoursDecimal: Prisma.Decimal | null = null;

        if (latestRate) {
          const calc = calculateGrossWage(
            latestRate.wageType,
            latestRate.rate,
            entry.status,
            entry.hoursWorked
          );
          payableUnits = calc.payableUnits;
          hoursDecimal = calc.hoursWorked;
        } else {
          // If rate is missing, validate generic constraints:
          if (entry.status === AttendanceStatus.PRESENT) {
            payableUnits = entry.hoursWorked ? roundHalfUp(entry.hoursWorked, 2) : new Prisma.Decimal('1.00');
            hoursDecimal = entry.hoursWorked ? roundHalfUp(entry.hoursWorked, 2) : null;
          } else if (entry.status === AttendanceStatus.HALF_DAY) {
            payableUnits = new Prisma.Decimal('0.50');
            hoursDecimal = null;
          }
        }

        // 5. Check if worker already has attendance on this date for a DIFFERENT site (Unique constraint protection)
        const conflict = await tx.attendance.findFirst({
          where: {
            organizationId,
            workerId: entry.workerId,
            attendanceDate: targetDate,
            NOT: { submissionId },
          },
          include: { site: true },
        });

        if (conflict) {
          throw new ConflictError(
            `Worker '${worker.name}' (${worker.code}) already has attendance recorded on this date at site '${conflict.site.name}' (${conflict.site.code}).`,
            ErrorCode.DUPLICATE_ATTENDANCE
          );
        }

        // 6. Upsert Attendance record
        await tx.attendance.upsert({
          where: {
            organizationId_workerId_attendanceDate: {
              organizationId,
              workerId: entry.workerId,
              attendanceDate: targetDate,
            },
          },
          create: {
            organizationId,
            submissionId,
            workerId: entry.workerId,
            siteId: submission.siteId,
            attendanceDate: targetDate,
            status: entry.status,
            hoursWorked: hoursDecimal ? hoursDecimal.toNumber() : null,
            payableUnits: payableUnits.toNumber(),
            notes: entry.notes || null,
            version: 1,
          },
          update: {
            status: entry.status,
            hoursWorked: hoursDecimal ? hoursDecimal.toNumber() : null,
            payableUnits: payableUnits.toNumber(),
            notes: entry.notes || null,
            version: { increment: 1 },
          },
        });
      }

      // If submission was REJECTED, returning edits transitions back to DRAFT
      await tx.attendanceSubmission.update({
        where: { id: submissionId },
        data: {
          status: SubmissionStatus.DRAFT,
          rejectionReason: null,
          version: { increment: 1 },
        },
      });
    });

    await logAudit({
      organizationId,
      userId: actorUserId,
      action: 'ATTENDANCE_DRAFT_SAVED',
      entityType: 'AttendanceSubmission',
      entityId: submissionId,
      metadata: { count: input.entries.length },
    });

    return this.getSubmissionDetails(organizationId, submissionId, actorUserId, actorRole);
  }

  /**
   * Submit an attendance submission for approval (Freezes entries, enforces roster completeness)
   */
  async submitAttendance(
    organizationId: string,
    submissionId: string,
    actorUserId: string,
    actorRole: Role
  ): Promise<AttendanceSubmissionDetail> {
    const details = await this.getSubmissionDetails(organizationId, submissionId, actorUserId, actorRole);

    if (details.status === SubmissionStatus.SUBMITTED) {
      throw new BadRequestError('Submission is already submitted for approval.');
    }

    if (details.status === SubmissionStatus.APPROVED) {
      throw new BadRequestError('Submission is already approved.', ErrorCode.ALREADY_APPROVED);
    }

    // Enforce roster completeness
    if (!details.rosterSummary.isComplete) {
      throw new BadRequestError(
        `All eligible workers on the site roster must have explicit attendance records before submission. (Entered: ${details.rosterSummary.totalEntered} of ${details.rosterSummary.totalEligible} eligible workers). Do not silently replace missing attendance with absence.`,
        ErrorCode.INCOMPLETE_ROSTER
      );
    }

    await prisma.attendanceSubmission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.SUBMITTED,
        submittedByUserId: actorUserId,
        submittedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await logAudit({
      organizationId,
      userId: actorUserId,
      action: 'ATTENDANCE_SUBMITTED',
      entityType: 'AttendanceSubmission',
      entityId: submissionId,
    });

    return this.getSubmissionDetails(organizationId, submissionId, actorUserId, actorRole);
  }

  /**
   * Approve an attendance submission (Atomic gross wage calculation & snapshotting, self-approval prevented)
   */
  async approveSubmission(
    organizationId: string,
    submissionId: string,
    actorUserId: string,
    actorRole: Role
  ): Promise<AttendanceSubmissionDetail> {
    // 1. Permissions: Only OWNER and ACCOUNTANT can approve
    if (actorRole !== Role.OWNER && actorRole !== Role.ACCOUNTANT) {
      throw new ForbiddenError(
        'Only Organization Owners and Accountants can approve attendance submissions.',
        ErrorCode.FORBIDDEN
      );
    }

    const submission = await prisma.attendanceSubmission.findFirst({
      where: { id: submissionId, organizationId },
      include: {
        attendances: {
          include: {
            worker: {
              include: {
                wageRates: {
                  orderBy: { effectiveFrom: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundError('Attendance submission not found.');
    }

    // 2. Self-Approval Prevention
    if (submission.submittedByUserId === actorUserId) {
      throw new ForbiddenError(
        'A user cannot approve their own submission. Another authorized Owner or Accountant must approve it.',
        ErrorCode.CANNOT_APPROVE_OWN_SUBMISSION
      );
    }

    // Idempotency: if already approved, return without duplicating wage entries
    if (submission.status === SubmissionStatus.APPROVED) {
      return this.getSubmissionDetails(organizationId, submissionId, actorUserId, actorRole);
    }

    const targetDate = submission.attendanceDate;
    const dayEnd = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));

    // 3. Validate missing rates: Missing rates block approval
    for (const att of submission.attendances) {
      if (att.status !== AttendanceStatus.ABSENT) {
        const rate = att.worker.wageRates.find((r) => r.effectiveFrom <= dayEnd);
        if (!rate) {
          throw new BadRequestError(
            `Cannot approve submission: Worker '${att.worker.name}' (${att.worker.code}) has no effective wage rate on or before ${formatDateOnly(submission.attendanceDate)}.`,
            ErrorCode.MISSING_WAGE_RATE
          );
        }
      }
    }

    const now = new Date();

    // 4. Atomic Transaction: Transition status + Snapshot Wage Entries + Audit Log
    await sourceTransaction(organizationId, async (tx) => {
      // Optimistic concurrency update
      const updatedSubmission = await tx.attendanceSubmission.update({
        where: {
          id: submissionId,
          version: submission.version,
        },
        data: {
          status: SubmissionStatus.APPROVED,
          approvedByUserId: actorUserId,
          approvedAt: now,
          version: { increment: 1 },
        },
      });

      // Clear any prior wage entries for these attendances (idempotency safety)
      const attendanceIds = submission.attendances.map((a) => a.id);
      await tx.wageEntry.deleteMany({
        where: { attendanceId: { in: attendanceIds } },
      });

      // Create snapshot WageEntry records
      for (const att of submission.attendances) {
        const applicableRate = att.worker.wageRates.find((r) => r.effectiveFrom <= dayEnd);

        if (att.status === AttendanceStatus.ABSENT) {
          // Zero payable units for absence
          if (applicableRate) {
            await tx.wageEntry.create({
              data: {
                organizationId,
                attendanceId: att.id,
                workerId: att.workerId,
                siteId: submission.siteId,
                attendanceDate: targetDate,
                wageRateId: applicableRate.id,
                wageType: applicableRate.wageType,
                rate: applicableRate.rate,
                payableUnits: 0,
                hoursWorked: null,
                grossWage: 0,
                status: WageEntryStatus.ACTIVE,
                approvedByUserId: actorUserId,
                approvedAt: now,
              },
            });
          }
        } else if (applicableRate) {
          const calc = calculateGrossWage(
            applicableRate.wageType,
            applicableRate.rate,
            att.status,
            att.hoursWorked
          );

          await tx.wageEntry.create({
            data: {
              organizationId,
              attendanceId: att.id,
              workerId: att.workerId,
              siteId: submission.siteId,
              attendanceDate: targetDate,
              wageRateId: applicableRate.id,
              wageType: applicableRate.wageType,
              rate: applicableRate.rate,
              payableUnits: calc.payableUnits.toNumber(),
              hoursWorked: calc.hoursWorked ? calc.hoursWorked.toNumber() : null,
              grossWage: calc.grossWage.toNumber(),
              status: WageEntryStatus.ACTIVE,
              approvedByUserId: actorUserId,
              approvedAt: now,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'ATTENDANCE_APPROVED',
          entityType: 'AttendanceSubmission',
          entityId: submissionId,
          metadata: {
            approvedAt: now.toISOString(),
            attendanceCount: submission.attendances.length,
          },
        },
      });
    });

    return this.getSubmissionDetails(organizationId, submissionId, actorUserId, actorRole);
  }

  /**
   * Reject an attendance submission (Requires reason, returns entries to editable draft)
   */
  async rejectSubmission(
    organizationId: string,
    submissionId: string,
    input: RejectSubmissionInput,
    actorUserId: string,
    actorRole: Role
  ): Promise<AttendanceSubmissionDetail> {
    if (actorRole !== Role.OWNER && actorRole !== Role.ACCOUNTANT) {
      throw new ForbiddenError(
        'Only Organization Owners and Accountants can reject attendance submissions.',
        ErrorCode.FORBIDDEN
      );
    }

    const submission = await prisma.attendanceSubmission.findFirst({
      where: { id: submissionId, organizationId },
    });

    if (!submission) {
      throw new NotFoundError('Attendance submission not found.');
    }

    if (submission.status === SubmissionStatus.APPROVED) {
      throw new BadRequestError('Approved attendance submissions cannot be rejected.', ErrorCode.ALREADY_APPROVED);
    }

    const now = new Date();

    await sourceTransaction(organizationId, async (tx) => {
      await tx.attendanceSubmission.update({
        where: { id: submissionId, version: submission.version },
        data: {
          status: SubmissionStatus.REJECTED,
          rejectionReason: input.reason,
          rejectedByUserId: actorUserId,
          rejectedAt: now,
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'ATTENDANCE_REJECTED',
          entityType: 'AttendanceSubmission',
          entityId: submissionId,
          metadata: { reason: input.reason },
        },
      });
    });

    return this.getSubmissionDetails(organizationId, submissionId, actorUserId, actorRole);
  }

  /**
   * Request attendance correction for an approved record
   */
  async requestCorrection(
    organizationId: string,
    attendanceId: string,
    input: CreateCorrectionInput,
    actorUserId: string
  ) {
    const attendance = await prisma.attendance.findFirst({
      where: { id: attendanceId, organizationId },
      include: {
        submission: true,
        worker: {
          include: {
            wageRates: {
              orderBy: { effectiveFrom: 'desc' },
            },
          },
        },
        wageEntries: {
          where: { status: WageEntryStatus.ACTIVE },
          take: 1,
        },
      },
    });

    if (!attendance) {
      throw new NotFoundError('Attendance record not found.');
    }

    if (attendance.submission.status !== SubmissionStatus.APPROVED) {
      throw new BadRequestError('Corrections can only be requested on approved attendance records.');
    }

    // Check if there is already a PENDING correction
    const pendingCorrection = await prisma.attendanceCorrection.findFirst({
      where: { attendanceId, status: CorrectionStatus.PENDING },
    });

    if (pendingCorrection) {
      throw new ConflictError('A pending correction request already exists for this attendance record.');
    }

    const targetDate = attendance.attendanceDate;
    const dayEnd = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));
    const rate = attendance.worker.wageRates.find((r) => r.effectiveFrom <= dayEnd);

    if (!rate && input.newStatus !== AttendanceStatus.ABSENT) {
      throw new BadRequestError('Cannot request correction: worker has no applicable wage rate.');
    }

    let newPayableUnits = new Prisma.Decimal('0.00');
    let newHoursWorked: Prisma.Decimal | null = null;
    let newWageAmount = new Prisma.Decimal('0.00');

    if (input.newStatus !== AttendanceStatus.ABSENT && rate) {
      const calc = calculateGrossWage(
        rate.wageType,
        rate.rate,
        input.newStatus,
        input.newHoursWorked
      );
      newPayableUnits = calc.payableUnits;
      newHoursWorked = calc.hoursWorked;
      newWageAmount = calc.grossWage;
    }

    const currentWageAmount = attendance.wageEntries[0]?.grossWage ?? 0;

    const correction = await sourceTransaction(organizationId, async (tx) => {
      const created = await tx.attendanceCorrection.create({
        data: {
          organizationId,
          attendanceId,
          previousStatus: attendance.status,
          previousHoursWorked: attendance.hoursWorked,
          previousPayableUnits: attendance.payableUnits,
          previousWageAmount: currentWageAmount,
          newStatus: input.newStatus,
          newHoursWorked: newHoursWorked ? newHoursWorked.toNumber() : null,
          newPayableUnits: newPayableUnits.toNumber(),
          newWageAmount: newWageAmount.toNumber(),
          reason: input.reason,
          status: CorrectionStatus.PENDING,
          requestedByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'ATTENDANCE_CORRECTION_REQUESTED',
          entityType: 'AttendanceCorrection',
          entityId: created.id,
          metadata: {
            attendanceId,
            reason: input.reason,
            newStatus: input.newStatus,
          },
        },
      });

      return created;
    });

    return correction;
  }

  /**
   * Review (Approve or Reject) an attendance correction request
   * Must be approved by a DIFFERENT authorized user (OWNER or ACCOUNTANT)
   */
  async reviewCorrection(
    organizationId: string,
    correctionId: string,
    input: ReviewCorrectionInput,
    actorUserId: string,
    actorRole: Role
  ) {
    if (actorRole !== Role.OWNER && actorRole !== Role.ACCOUNTANT) {
      throw new ForbiddenError(
        'Only Organization Owners and Accountants can review attendance corrections.',
        ErrorCode.FORBIDDEN
      );
    }

    const correction = await prisma.attendanceCorrection.findFirst({
      where: { id: correctionId, organizationId },
      include: {
        attendance: {
          include: {
            worker: {
              include: {
                wageRates: {
                  orderBy: { effectiveFrom: 'desc' },
                },
              },
            },
          },
        },
      },
    });

    if (!correction) {
      throw new NotFoundError('Correction request not found.');
    }

    if (correction.status !== CorrectionStatus.PENDING) {
      throw new BadRequestError('This correction request has already been reviewed.');
    }

    // Different-user approval enforcement
    if (correction.requestedByUserId === actorUserId) {
      throw new ForbiddenError(
        'Corrections must be reviewed and approved by a different authorized user.',
        ErrorCode.CANNOT_APPROVE_OWN_CORRECTION
      );
    }

    const now = new Date();

    if (input.action === 'REJECT') {
      const updated = await sourceTransaction(organizationId, async (tx) => {
        const res = await tx.attendanceCorrection.update({
          where: { id: correctionId },
          data: {
            status: CorrectionStatus.REJECTED,
            reviewedByUserId: actorUserId,
            reviewedAt: now,
            reviewNotes: input.reviewNotes || null,
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            userId: actorUserId,
            action: 'ATTENDANCE_CORRECTION_REJECTED',
            entityType: 'AttendanceCorrection',
            entityId: correctionId,
            metadata: { reviewNotes: input.reviewNotes },
          },
        });

        return res;
      });

      return updated;
    }

    // APPROVE correction
    const targetDate = correction.attendance.attendanceDate;
    const dayEnd = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 23, 59, 59, 999));
    const applicableRate = correction.attendance.worker.wageRates.find((r) => r.effectiveFrom <= dayEnd);

    const updated = await sourceTransaction(organizationId, async (tx) => {
      // 1. Mark correction approved
      const approvedCorrection = await tx.attendanceCorrection.update({
        where: { id: correctionId },
        data: {
          status: CorrectionStatus.APPROVED,
          reviewedByUserId: actorUserId,
          reviewedAt: now,
          reviewNotes: input.reviewNotes || null,
        },
      });

      // 2. Update attendance record (isCorrected = true)
      await tx.attendance.update({
        where: { id: correction.attendanceId },
        data: {
          status: correction.newStatus,
          hoursWorked: correction.newHoursWorked,
          payableUnits: correction.newPayableUnits,
          isCorrected: true,
          version: { increment: 1 },
        },
      });

      // 3. Supersede active wage entry so original and corrected amounts are NEVER double counted!
      await tx.wageEntry.updateMany({
        where: {
          attendanceId: correction.attendanceId,
          status: WageEntryStatus.ACTIVE,
        },
        data: {
          status: WageEntryStatus.SUPERSEDED,
        },
      });

      // 4. Create new replacement active WageEntry
      if (applicableRate) {
        await tx.wageEntry.create({
          data: {
            organizationId,
            attendanceId: correction.attendanceId,
            workerId: correction.attendance.workerId,
            siteId: correction.attendance.siteId,
            attendanceDate: targetDate,
            wageRateId: applicableRate.id,
            wageType: applicableRate.wageType,
            rate: applicableRate.rate,
            payableUnits: correction.newPayableUnits,
            hoursWorked: correction.newHoursWorked,
            grossWage: correction.newWageAmount,
            status: WageEntryStatus.ACTIVE,
            approvedByUserId: actorUserId,
            approvedAt: now,
            correctionId: approvedCorrection.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'ATTENDANCE_CORRECTION_APPROVED',
          entityType: 'AttendanceCorrection',
          entityId: correctionId,
          metadata: {
            previousWage: Number(correction.previousWageAmount),
            newWage: Number(correction.newWageAmount),
          },
        },
      });

      return approvedCorrection;
    });

    return updated;
  }

  /**
   * List correction requests with filtering
   */
  async listCorrections(
    organizationId: string,
    query: { status?: CorrectionStatus; siteId?: string }
  ) {
    const corrections = await prisma.attendanceCorrection.findMany({
      where: {
        organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.siteId ? { attendance: { siteId: query.siteId } } : {}),
      },
      include: {
        attendance: {
          include: {
            worker: { select: { id: true, name: true, code: true, trade: true } },
            site: { select: { id: true, name: true, code: true } },
          },
        },
        requestedByUser: { select: { id: true, name: true, role: true } },
        reviewedByUser: { select: { id: true, name: true, role: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return corrections.map((c) => ({
      id: c.id,
      attendanceId: c.attendanceId,
      worker: c.attendance.worker,
      site: c.attendance.site,
      attendanceDate: formatDateOnly(c.attendance.attendanceDate),
      previousStatus: c.previousStatus,
      previousHoursWorked: c.previousHoursWorked ? Number(c.previousHoursWorked) : null,
      previousWageAmount: Number(c.previousWageAmount),
      newStatus: c.newStatus,
      newHoursWorked: c.newHoursWorked ? Number(c.newHoursWorked) : null,
      newWageAmount: Number(c.newWageAmount),
      reason: c.reason,
      status: c.status,
      requestedBy: c.requestedByUser,
      requestedAt: c.requestedAt.toISOString(),
      reviewedBy: c.reviewedByUser,
      reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null,
      reviewNotes: c.reviewNotes,
    }));
  }
}

export const attendanceService = new AttendanceService();
