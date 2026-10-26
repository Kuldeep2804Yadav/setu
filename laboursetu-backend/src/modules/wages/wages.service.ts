import {
  prisma,
  WageEntryStatus,
  Prisma,
} from '../../database/index.js';
import {
  WageRegisterQueryInput,
  WageRegisterItem,
  WageRegisterSummary,
} from '../../shared/index.js';
import { parseDateOnly, formatDateOnly } from '../../utils/date.js';
import { generateCsv } from '../../utils/csv.js';

export class WagesService {
  async getWageRegister(
    organizationId: string,
    query: WageRegisterQueryInput
  ): Promise<WageRegisterSummary> {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      status: WageEntryStatus.ACTIVE, // Only active (non-superseded, non-reversed) entries
    };

    if (query.siteId) {
      where.siteId = query.siteId;
    }

    if (query.workerId) {
      where.workerId = query.workerId;
    }

    if (query.startDate || query.endDate) {
      where.attendanceDate = {};
      if (query.startDate) where.attendanceDate.gte = parseDateOnly(query.startDate);
      if (query.endDate) where.attendanceDate.lte = parseDateOnly(query.endDate);
    }

    // 1. Calculate overall totals across the full filtered set (without pagination)
    const allFilteredEntries = await prisma.wageEntry.findMany({
      where,
      select: {
        workerId: true,
        siteId: true,
        payableUnits: true,
        hoursWorked: true,
        grossWage: true,
      },
    });

    const uniqueWorkerIds = new Set(allFilteredEntries.map((e) => e.workerId));
    const uniqueSiteIds = new Set(allFilteredEntries.map((e) => e.siteId));

    let totalGrossWage = new Prisma.Decimal('0.00');
    let totalPresentUnits = new Prisma.Decimal('0.00');
    let totalHoursWorked = new Prisma.Decimal('0.00');

    for (const e of allFilteredEntries) {
      totalGrossWage = totalGrossWage.add(e.grossWage);
      totalPresentUnits = totalPresentUnits.add(e.payableUnits);
      if (e.hoursWorked) {
        totalHoursWorked = totalHoursWorked.add(e.hoursWorked);
      }
    }

    // 2. Fetch paginated entries with full relationships
    const entries = await prisma.wageEntry.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ attendanceDate: 'desc' }, { worker: { name: 'asc' } }],
      include: {
        worker: {
          select: { id: true, code: true, name: true, trade: true },
        },
        site: {
          select: { id: true, code: true, name: true },
        },
        attendance: {
          select: { status: true },
        },
        approvedByUser: {
          select: { id: true, name: true },
        },
      },
    });

    const formattedEntries: WageRegisterItem[] = entries.map((e) => ({
      id: e.id,
      attendanceId: e.attendanceId,
      workerId: e.workerId,
      workerName: e.worker.name,
      workerCode: e.worker.code,
      trade: e.worker.trade,
      siteId: e.siteId,
      siteName: e.site.name,
      siteCode: e.site.code,
      attendanceDate: formatDateOnly(e.attendanceDate),
      attendanceStatus: e.attendance.status,
      wageType: e.wageType,
      rate: Number(e.rate),
      payableUnits: Number(e.payableUnits),
      hoursWorked: e.hoursWorked ? Number(e.hoursWorked) : null,
      grossWage: Number(e.grossWage),
      status: e.status,
      approvedAt: e.approvedAt.toISOString(),
      approvedByName: e.approvedByUser.name,
    }));

    return {
      period: {
        startDate: query.startDate,
        endDate: query.endDate,
      },
      totals: {
        totalWorkers: uniqueWorkerIds.size,
        totalSites: uniqueSiteIds.size,
        totalPresentUnits: Number(totalPresentUnits),
        totalHoursWorked: Number(totalHoursWorked),
        totalGrossWage: Number(totalGrossWage),
      },
      entries: formattedEntries,
    };
  }

  async exportCsv(
    organizationId: string,
    query: WageRegisterQueryInput
  ): Promise<string> {
    const where: any = {
      organizationId,
      status: WageEntryStatus.ACTIVE,
    };

    if (query.siteId) where.siteId = query.siteId;
    if (query.workerId) where.workerId = query.workerId;
    if (query.startDate || query.endDate) {
      where.attendanceDate = {};
      if (query.startDate) where.attendanceDate.gte = parseDateOnly(query.startDate);
      if (query.endDate) where.attendanceDate.lte = parseDateOnly(query.endDate);
    }

    const entries = await prisma.wageEntry.findMany({
      where,
      orderBy: [{ attendanceDate: 'asc' }, { worker: { name: 'asc' } }],
      include: {
        worker: { select: { code: true, name: true, trade: true } },
        site: { select: { code: true, name: true } },
        attendance: { select: { status: true } },
        approvedByUser: { select: { name: true } },
      },
    });

    const headers = [
      'Attendance Date',
      'Worker Code',
      'Worker Name',
      'Trade',
      'Site Code',
      'Site Name',
      'Attendance Status',
      'Wage Type',
      'Applicable Rate (INR)',
      'Payable Units / Hours',
      'Gross Wage Earned (INR)',
      'Approved Date',
      'Approved By',
    ];

    const rows = entries.map((e) => [
      formatDateOnly(e.attendanceDate),
      e.worker.code,
      e.worker.name,
      e.worker.trade,
      e.site.code,
      e.site.name,
      e.attendance.status,
      e.wageType,
      Number(e.rate).toFixed(2),
      Number(e.payableUnits).toFixed(2),
      Number(e.grossWage).toFixed(2),
      formatDateOnly(e.approvedAt),
      e.approvedByUser.name,
    ]);

    return generateCsv(headers, rows);
  }
}

export const wagesService = new WagesService();
