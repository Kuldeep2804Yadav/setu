import {
  prisma,
  WorkerStatus,
  SiteStatus,
  Role,
  AssignmentStatus,
} from '../../database/index.js';
import { DashboardMetrics } from '../../shared/index.js';

export class DashboardService {
  async getMetrics(organizationId: string): Promise<DashboardMetrics> {
    const [
      totalWorkers,
      activeWorkers,
      activeSites,
      totalSupervisors,
      recentWorkers,
      tradesGroup,
    ] = await Promise.all([
      prisma.worker.count({
        where: {
          organizationId,
          status: { not: WorkerStatus.ARCHIVED },
        },
      }),
      prisma.worker.count({
        where: {
          organizationId,
          status: WorkerStatus.ACTIVE,
        },
      }),
      prisma.site.count({
        where: {
          organizationId,
          status: SiteStatus.ACTIVE,
        },
      }),
      prisma.user.count({
        where: {
          organizationId,
          role: Role.SUPERVISOR,
          isActive: true,
        },
      }),
      prisma.worker.findMany({
        where: {
          organizationId,
          status: { not: WorkerStatus.ARCHIVED },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          siteAssignments: {
            where: { status: AssignmentStatus.ACTIVE },
            include: { site: { select: { name: true } } },
            take: 1,
          },
          wageRates: {
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.worker.groupBy({
        by: ['trade'],
        where: {
          organizationId,
          status: WorkerStatus.ACTIVE,
        },
        _count: {
          _all: true,
        },
        orderBy: {
          _count: {
            trade: 'desc',
          },
        },
      }),
    ]);

    const formattedRecentWorkers = recentWorkers.map((w) => {
      const activeSite = w.siteAssignments[0]?.site?.name || null;
      const latestWage = w.wageRates[0]?.rate ? Number(w.wageRates[0].rate) : null;

      return {
        id: w.id,
        code: w.code,
        name: w.name,
        trade: w.trade,
        mobileNumber: w.mobileNumber,
        status: w.status as any,
        verificationStatus: w.verificationStatus as any,
        createdAt: w.createdAt.toISOString(),
        activeSiteName: activeSite,
        currentWageRate: latestWage,
      };
    });

    const tradeDistribution = tradesGroup.map((t) => ({
      trade: t.trade,
      count: t._count._all,
    }));

    return {
      totalWorkers,
      activeWorkers,
      activeSites,
      totalSupervisors,
      recentWorkers: formattedRecentWorkers,
      tradeDistribution,
    };
  }
}

export const dashboardService = new DashboardService();
