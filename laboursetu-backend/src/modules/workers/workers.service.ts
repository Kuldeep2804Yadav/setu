import {
  prisma,
  WorkerStatus,
  AssignmentStatus,
  WageType,
  Prisma,
} from '../../database/index.js';
import {
  CreateWorkerInput,
  UpdateWorkerInput,
  WorkerQueryInput,
  AssignWorkerSiteInput,
  CreateWageRateInput,
  ErrorCode,
} from '../../shared/index.js';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '../../utils/errors.js';
import { logAudit } from '../../utils/audit.js';

export class WorkersService {
  private normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private async generateWorkerCode(organizationId: string): Promise<string> {
    const count = await prisma.worker.count({
      where: { organizationId },
    });

    let codeNum = count + 1;
    let candidate = `WRK-${codeNum.toString().padStart(3, '0')}`;

    // Loop check in rare case of deletions/existing codes
    let exists = await prisma.worker.findFirst({
      where: { organizationId, code: candidate },
    });

    while (exists) {
      codeNum += 1;
      candidate = `WRK-${codeNum.toString().padStart(3, '0')}`;
      exists = await prisma.worker.findFirst({
        where: { organizationId, code: candidate },
      });
    }

    return candidate;
  }

  async listWorkers(organizationId: string, query: WorkerQueryInput) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.trade ? { trade: query.trade } : {}),
      ...(query.verificationStatus ? { verificationStatus: query.verificationStatus } : {}),
    };

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
        { mobileNumber: { contains: term } },
      ];
    }

    if (query.siteId) {
      where.siteAssignments = {
        some: {
          siteId: query.siteId,
          status: AssignmentStatus.ACTIVE,
        },
      };
    }

    const [total, workers] = await Promise.all([
      prisma.worker.count({ where }),
      prisma.worker.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          siteAssignments: {
            where: { status: AssignmentStatus.ACTIVE },
            include: {
              site: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
            take: 1,
          },
          wageRates: {
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    const formattedWorkers = workers.map((w) => {
      const activeAssignment = w.siteAssignments[0] || null;
      const latestWage = w.wageRates[0] || null;

      return {
        id: w.id,
        code: w.code,
        name: w.name,
        trade: w.trade,
        mobileNumber: w.mobileNumber,
        verificationStatus: w.verificationStatus,
        aadhaarLastFour: w.aadhaarLastFour,
        status: w.status,
        archivedAt: w.archivedAt,
        notes: w.notes,
        createdAt: w.createdAt,
        activeSite: activeAssignment
          ? {
              id: activeAssignment.site.id,
              name: activeAssignment.site.name,
              code: activeAssignment.site.code,
              assignedSince: activeAssignment.startDate,
            }
          : null,
        currentWage: latestWage
          ? {
              id: latestWage.id,
              wageType: latestWage.wageType,
              rate: Number(latestWage.rate),
              effectiveFrom: latestWage.effectiveFrom,
            }
          : null,
      };
    });

    return {
      workers: formattedWorkers,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getWorkerById(organizationId: string, workerId: string) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, organizationId },
      include: {
        siteAssignments: {
          include: {
            site: {
              select: {
                id: true,
                name: true,
                code: true,
                location: true,
              },
            },
          },
          orderBy: { startDate: 'desc' },
        },
        wageRates: {
          include: {
            createdByUser: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { effectiveFrom: 'desc' },
        },
      },
    });

    if (!worker) {
      throw new NotFoundError('Worker not found in your organization.');
    }

    const activeAssignment = worker.siteAssignments.find(
      (a) => a.status === AssignmentStatus.ACTIVE
    );

    const currentWage =
      worker.wageRates.find((w) => w.effectiveTo === null) ||
      worker.wageRates[0] ||
      null;

    return {
      ...worker,
      activeSite: activeAssignment
        ? {
            id: activeAssignment.site.id,
            name: activeAssignment.site.name,
            code: activeAssignment.site.code,
            location: activeAssignment.site.location,
            assignedSince: activeAssignment.startDate,
          }
        : null,
      currentWage: currentWage
        ? {
            id: currentWage.id,
            wageType: currentWage.wageType,
            rate: Number(currentWage.rate),
            effectiveFrom: currentWage.effectiveFrom,
            notes: currentWage.notes,
          }
        : null,
      wageRateHistory: worker.wageRates.map((wr) => ({
        id: wr.id,
        wageType: wr.wageType,
        rate: Number(wr.rate),
        effectiveFrom: wr.effectiveFrom,
        effectiveTo: wr.effectiveTo,
        notes: wr.notes,
        createdAt: wr.createdAt,
        createdBy: wr.createdByUser ? wr.createdByUser.name : null,
      })),
      siteAssignmentHistory: worker.siteAssignments.map((sa) => ({
        id: sa.id,
        siteId: sa.siteId,
        siteName: sa.site.name,
        siteCode: sa.site.code,
        startDate: sa.startDate,
        endDate: sa.endDate,
        status: sa.status,
        notes: sa.notes,
      })),
    };
  }

  async createWorker(
    organizationId: string,
    actorUserId: string,
    input: CreateWorkerInput
  ) {
    const normalizedName = this.normalizeName(input.name);
    const mobile = input.mobileNumber && input.mobileNumber.trim() !== '' ? input.mobileNumber.trim() : null;

    // 1. DUPLICATE CHECK:
    // Prevent ambiguous duplicate worker registration within the same contractor:
    // Same name + same phone number = REJECT.
    // Same phone number with different name = ALLOW (legitimate shared family mobile).
    if (mobile) {
      const existingSameWorker = await prisma.worker.findFirst({
        where: {
          organizationId,
          normalizedName,
          mobileNumber: mobile,
          status: { not: WorkerStatus.ARCHIVED },
        },
      });

      if (existingSameWorker) {
        throw new ConflictError(
          `A worker named '${input.name}' with mobile number '${mobile}' is already registered in your organization (Worker Code: ${existingSameWorker.code}).`,
          ErrorCode.DUPLICATE_WORKER
        );
      }
    }

    // 2. Worker code: generate if not supplied or check uniqueness
    let workerCode: string;
    if (input.code) {
      const codeCheck = await prisma.worker.findFirst({
        where: {
          organizationId,
          code: input.code,
        },
      });

      if (codeCheck) {
        throw new ConflictError(
          `Worker code '${input.code}' is already assigned to another worker in your organization.`,
          ErrorCode.DUPLICATE_CODE
        );
      }
      workerCode = input.code;
    } else {
      workerCode = await this.generateWorkerCode(organizationId);
    }

    // 3. Validate initial site if supplied
    if (input.initialSiteId) {
      const site = await prisma.site.findFirst({
        where: { id: input.initialSiteId, organizationId },
      });
      if (!site) {
        throw new BadRequestError('Initial assigned site not found in your organization.');
      }
    }

    // 4. Atomic creation of Worker + Wage Rate + Site Assignment
    const worker = await prisma.$transaction(async (tx) => {
      const createdWorker = await tx.worker.create({
        data: {
          organizationId,
          code: workerCode,
          name: input.name.trim(),
          normalizedName,
          mobileNumber: mobile,
          trade: input.trade,
          verificationStatus: input.verificationStatus,
          aadhaarLastFour: input.aadhaarLastFour || null,
          notes: input.notes || null,
          status: WorkerStatus.ACTIVE,
        },
      });

      // Initial wage rate
      if (input.initialWage) {
        await tx.wageRate.create({
          data: {
            workerId: createdWorker.id,
            wageType: input.initialWage.wageType,
            rate: new Prisma.Decimal(input.initialWage.rate),
            effectiveFrom: input.initialWage.effectiveFrom || new Date(),
            notes: input.initialWage.notes || 'Initial joining wage rate',
            createdByUserId: actorUserId,
          },
        });
      }

      // Initial site assignment
      if (input.initialSiteId) {
        await tx.workerSiteAssignment.create({
          data: {
            workerId: createdWorker.id,
            siteId: input.initialSiteId,
            startDate: new Date(),
            status: AssignmentStatus.ACTIVE,
            notes: 'Initial assignment upon registration',
          },
        });
      }

      return createdWorker;
    });

    await logAudit({
      organizationId,
      userId: actorUserId,
      action: 'WORKER_REGISTERED',
      entityType: 'Worker',
      entityId: worker.id,
      metadata: { code: worker.code, name: worker.name, trade: worker.trade },
    });

    return this.getWorkerById(organizationId, worker.id);
  }

  async updateWorker(
    organizationId: string,
    actorUserId: string,
    workerId: string,
    input: UpdateWorkerInput
  ) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, organizationId },
    });

    if (!worker) {
      throw new NotFoundError('Worker not found in your organization.');
    }

    const nextName = input.name ? input.name.trim() : worker.name;
    const normalizedName = this.normalizeName(nextName);
    const nextMobile =
      input.mobileNumber !== undefined
        ? input.mobileNumber && input.mobileNumber.trim() !== ''
          ? input.mobileNumber.trim()
          : null
        : worker.mobileNumber;

    // Check duplicate if name or phone changed
    if (nextMobile && (nextName !== worker.name || nextMobile !== worker.mobileNumber)) {
      const duplicate = await prisma.worker.findFirst({
        where: {
          organizationId,
          normalizedName,
          mobileNumber: nextMobile,
          NOT: { id: workerId },
          status: { not: WorkerStatus.ARCHIVED },
        },
      });

      if (duplicate) {
        throw new ConflictError(
          `Another worker named '${nextName}' with mobile number '${nextMobile}' already exists in your organization.`,
          ErrorCode.DUPLICATE_WORKER
        );
      }
    }

    // Check code collision if code updated
    if (input.code && input.code !== worker.code) {
      const codeCheck = await prisma.worker.findFirst({
        where: {
          organizationId,
          code: input.code,
          NOT: { id: workerId },
        },
      });

      if (codeCheck) {
        throw new ConflictError(
          `Worker code '${input.code}' is already assigned to another worker in your organization.`,
          ErrorCode.DUPLICATE_CODE
        );
      }
    }

    const updated = await prisma.worker.update({
      where: { id: workerId },
      data: {
        ...(input.name ? { name: input.name.trim(), normalizedName } : {}),
        ...(input.code ? { code: input.code } : {}),
        ...(input.mobileNumber !== undefined ? { mobileNumber: nextMobile } : {}),
        ...(input.trade ? { trade: input.trade } : {}),
        ...(input.verificationStatus ? { verificationStatus: input.verificationStatus } : {}),
        ...(input.aadhaarLastFour !== undefined
          ? { aadhaarLastFour: input.aadhaarLastFour || null }
          : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });

    await logAudit({
      organizationId,
      userId: actorUserId,
      action: 'WORKER_UPDATED',
      entityType: 'Worker',
      entityId: workerId,
      metadata: input,
    });

    return this.getWorkerById(organizationId, updated.id);
  }

  async archiveWorker(
    organizationId: string,
    actorUserId: string,
    workerId: string
  ) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, organizationId },
    });

    if (!worker) {
      throw new NotFoundError('Worker not found in your organization.');
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.worker.update({
        where: { id: workerId },
        data: {
          status: WorkerStatus.ARCHIVED,
          archivedAt: now,
        },
      }),
      // Mark current site assignment completed
      prisma.workerSiteAssignment.updateMany({
        where: {
          workerId,
          status: AssignmentStatus.ACTIVE,
        },
        data: {
          status: AssignmentStatus.COMPLETED,
          endDate: now,
        },
      }),
    ]);

    await logAudit({
      organizationId,
      userId: actorUserId,
      action: 'WORKER_ARCHIVED',
      entityType: 'Worker',
      entityId: workerId,
    });

    return { message: 'Worker has been archived successfully.' };
  }

  async addWageRate(
    organizationId: string,
    actorUserId: string,
    workerId: string,
    input: CreateWageRateInput
  ) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, organizationId },
    });

    if (!worker) {
      throw new NotFoundError('Worker not found in your organization.');
    }

    const effectiveFromDate =
      input.effectiveFrom instanceof Date
        ? input.effectiveFrom
        : new Date(input.effectiveFrom);

    const wageRate = await prisma.$transaction(async (tx) => {
      // Close any open-ended prior wage rates where effectiveTo is null
      await tx.wageRate.updateMany({
        where: {
          workerId,
          effectiveTo: null,
          effectiveFrom: { lt: effectiveFromDate },
        },
        data: {
          effectiveTo: effectiveFromDate,
        },
      });

      return tx.wageRate.create({
        data: {
          workerId,
          wageType: input.wageType,
          rate: new Prisma.Decimal(input.rate),
          effectiveFrom: effectiveFromDate,
          effectiveTo: input.effectiveTo || null,
          notes: input.notes || null,
          createdByUserId: actorUserId,
        },
      });
    });

    await logAudit({
      organizationId,
      userId: actorUserId,
      action: 'WAGE_RATE_ADDED',
      entityType: 'Worker',
      entityId: workerId,
      metadata: {
        rate: input.rate,
        wageType: input.wageType,
        effectiveFrom: effectiveFromDate,
      },
    });

    return {
      id: wageRate.id,
      workerId: wageRate.workerId,
      wageType: wageRate.wageType,
      rate: Number(wageRate.rate),
      effectiveFrom: wageRate.effectiveFrom,
      effectiveTo: wageRate.effectiveTo,
      notes: wageRate.notes,
      createdAt: wageRate.createdAt,
    };
  }

  async assignSite(
    organizationId: string,
    actorUserId: string,
    workerId: string,
    input: AssignWorkerSiteInput
  ) {
    const worker = await prisma.worker.findFirst({
      where: { id: workerId, organizationId },
    });

    if (!worker) {
      throw new NotFoundError('Worker not found in your organization.');
    }

    const site = await prisma.site.findFirst({
      where: { id: input.siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site not found in your organization.');
    }

    const startDate = input.startDate || new Date();

    const assignment = await prisma.$transaction(async (tx) => {
      // Complete any existing active assignments
      await tx.workerSiteAssignment.updateMany({
        where: {
          workerId,
          status: AssignmentStatus.ACTIVE,
        },
        data: {
          status: AssignmentStatus.COMPLETED,
          endDate: startDate,
        },
      });

      return tx.workerSiteAssignment.create({
        data: {
          workerId,
          siteId: input.siteId,
          startDate,
          endDate: input.endDate || null,
          status: AssignmentStatus.ACTIVE,
          notes: input.notes || null,
        },
        include: {
          site: {
            select: { id: true, name: true, code: true },
          },
        },
      });
    });

    await logAudit({
      organizationId,
      userId: actorUserId,
      action: 'WORKER_SITE_ASSIGNED',
      entityType: 'Worker',
      entityId: workerId,
      metadata: { siteId: input.siteId, siteName: site.name },
    });

    return assignment;
  }
}

export const workersService = new WorkersService();
