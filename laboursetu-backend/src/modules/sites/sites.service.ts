import { prisma, SiteStatus, AssignmentStatus } from '../../database/index.js';
import {
  CreateSiteInput,
  UpdateSiteInput,
  SiteQueryInput,
  AssignSupervisorsInput,
  ErrorCode,
} from '../../shared/index.js';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '../../utils/errors.js';
import { logAudit } from '../../utils/audit.js';

export class SitesService {
  async listSites(organizationId: string, query: SiteQueryInput) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { clientName: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, sites] = await Promise.all([
      prisma.site.count({ where }),
      prisma.site.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          supervisorSites: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  role: true,
                },
              },
            },
          },
          _count: {
            select: {
              workerAssignments: {
                where: { status: AssignmentStatus.ACTIVE },
              },
            },
          },
        },
      }),
    ]);

    const formattedSites = sites.map((site) => ({
      ...site,
      activeWorkerCount: site._count.workerAssignments,
      supervisors: site.supervisorSites.map((s) => s.user),
    }));

    return {
      sites: formattedSites,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getSiteById(organizationId: string, siteId: string) {
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        organizationId,
      },
      include: {
        supervisorSites: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
              },
            },
          },
        },
        workerAssignments: {
          where: { status: AssignmentStatus.ACTIVE },
          include: {
            worker: {
              select: {
                id: true,
                code: true,
                name: true,
                trade: true,
                mobileNumber: true,
                verificationStatus: true,
                status: true,
              },
            },
          },
          orderBy: { startDate: 'desc' },
        },
      },
    });

    if (!site) {
      throw new NotFoundError('Site not found in your organization.');
    }

    return {
      ...site,
      activeWorkerCount: site.workerAssignments.length,
      supervisors: site.supervisorSites.map((s) => s.user),
      assignedWorkers: site.workerAssignments.map((a) => ({
        assignmentId: a.id,
        startDate: a.startDate,
        worker: a.worker,
      })),
    };
  }

  async createSite(
    organizationId: string,
    userId: string,
    input: CreateSiteInput
  ) {
    // 1. Check if site code already exists within this tenant
    const existing = await prisma.site.findFirst({
      where: {
        organizationId,
        code: input.code,
      },
    });

    if (existing) {
      throw new ConflictError(
        `A site with code '${input.code}' already exists in your organization.`,
        ErrorCode.DUPLICATE_CODE
      );
    }

    // 2. Validate supervisor IDs if provided
    if (input.supervisorIds && input.supervisorIds.length > 0) {
      const supervisors = await prisma.user.findMany({
        where: {
          id: { in: input.supervisorIds },
          organizationId,
        },
      });

      if (supervisors.length !== input.supervisorIds.length) {
        throw new BadRequestError('One or more selected supervisors do not exist in your organization.');
      }
    }

    // 3. Create site with supervisors
    const site = await prisma.site.create({
      data: {
        organizationId,
        code: input.code,
        name: input.name,
        location: input.location || null,
        clientName: input.clientName || null,
        status: SiteStatus.ACTIVE,
        supervisorSites: {
          create: (input.supervisorIds || []).map((supId) => ({
            userId: supId,
          })),
        },
      },
      include: {
        supervisorSites: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    await logAudit({
      organizationId,
      userId,
      action: 'SITE_CREATED',
      entityType: 'Site',
      entityId: site.id,
      metadata: { code: site.code, name: site.name },
    });

    return site;
  }

  async updateSite(
    organizationId: string,
    userId: string,
    siteId: string,
    input: UpdateSiteInput
  ) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site not found in your organization.');
    }

    if (input.code && input.code !== site.code) {
      const existing = await prisma.site.findFirst({
        where: {
          organizationId,
          code: input.code,
          NOT: { id: siteId },
        },
      });

      if (existing) {
        throw new ConflictError(
          `A site with code '${input.code}' already exists in your organization.`,
          ErrorCode.DUPLICATE_CODE
        );
      }
    }

    const updated = await prisma.site.update({
      where: { id: siteId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.code ? { code: input.code } : {}),
        ...(input.location !== undefined ? { location: input.location || null } : {}),
        ...(input.clientName !== undefined ? { clientName: input.clientName || null } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.status === SiteStatus.ARCHIVED && site.status !== SiteStatus.ARCHIVED
          ? { archivedAt: new Date() }
          : {}),
      },
    });

    await logAudit({
      organizationId,
      userId,
      action: 'SITE_UPDATED',
      entityType: 'Site',
      entityId: siteId,
      metadata: input,
    });

    return updated;
  }

  async archiveSite(organizationId: string, userId: string, siteId: string) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site not found in your organization.');
    }

    const updated = await prisma.site.update({
      where: { id: siteId },
      data: {
        status: SiteStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });

    await logAudit({
      organizationId,
      userId,
      action: 'SITE_ARCHIVED',
      entityType: 'Site',
      entityId: siteId,
    });

    return updated;
  }

  async assignSupervisors(
    organizationId: string,
    userId: string,
    siteId: string,
    input: AssignSupervisorsInput
  ) {
    const site = await prisma.site.findFirst({
      where: { id: siteId, organizationId },
    });

    if (!site) {
      throw new NotFoundError('Site not found in your organization.');
    }

    // Verify supervisors belong to organization
    const supervisors = await prisma.user.findMany({
      where: {
        id: { in: input.supervisorIds },
        organizationId,
      },
    });

    if (supervisors.length !== input.supervisorIds.length) {
      throw new BadRequestError('One or more selected supervisors do not belong to this organization.');
    }

    await prisma.$transaction([
      prisma.supervisorSite.deleteMany({
        where: { siteId },
      }),
      prisma.supervisorSite.createMany({
        data: input.supervisorIds.map((supId) => ({
          siteId,
          userId: supId,
        })),
      }),
    ]);

    await logAudit({
      organizationId,
      userId,
      action: 'SITE_SUPERVISORS_UPDATED',
      entityType: 'Site',
      entityId: siteId,
      metadata: { supervisorIds: input.supervisorIds },
    });

    return this.getSiteById(organizationId, siteId);
  }
}

export const sitesService = new SitesService();
