import { Decimal } from "@prisma/client/runtime/library";
import { prisma, Prisma } from "../../database/index.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from "../../utils/errors.js";
import {
  calculateWages,
  money,
  paymentAvailability,
  settleAmounts,
  validateRecovery,
  type WagePolicy,
  type WageComponent,
  type HistoricalRate,
} from "./calculation.js";
import {
  audit,
  authorize,
  json,
  canonical,
  type Actor,
  type Tx,
} from "./finance.repository.js";
import type { PeriodInput, ListInput } from "./finance.schema.js";

const day = (d: Date) => d.toISOString().slice(0, 10);
const missing = { OR: [{ payrollId: null }, { payrollId: { isSet: false } }] };
const sum = (values: string[]) =>
  values.reduce((s, v) => s.add(v), new Decimal(0));
const defaults = {
  paidLeave: false,
  monthlyDivisor: "CALENDAR_MONTH",
  weeklyDivisor: "7",
  paidLeaveHours: "8",
  periodAbsenceRule: "UNPAID",
  accountantCanApprove: false,
};
export async function settings(tx: Tx, org: string) {
  return (
    (await tx.financeSettings.findUnique({ where: { organizationId: org } })) ??
    defaults
  );
}
export async function references(
  tx: Tx,
  org: string,
  workerId: string,
  siteId?: string,
) {
  const worker = await tx.worker.findFirst({
    where: { id: workerId, organizationId: org },
  });
  if (!worker) throw new NotFoundError("Worker not found");
  if (
    siteId &&
    !(await tx.site.findFirst({ where: { id: siteId, organizationId: org } }))
  )
    throw new NotFoundError("Site not found");
  return worker;
}
function actualDate(date: string) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (date > today)
    throw new BadRequestError(
      "Actual transaction date cannot be in the future",
    );
  return new Date(`${date}T00:00:00Z`);
}
export async function payroll(tx: Tx, org: string, id: string) {
  const found = await tx.payrollPeriod.findFirst({
    where: { id, organizationId: org },
    include: { items: { orderBy: { workerId: "asc" } } },
  });
  if (!found) throw new NotFoundError("Payroll not found");
  return found;
}

export interface SiteAmount {
  siteId: string;
  amount: string;
}
// Allocate rounded paise with a deterministic largest-remainder rule, retaining conservation.
export function allocate(amount: string, weights: SiteAmount[]): SiteAmount[] {
  const positive = weights
    .filter((w) => new Decimal(w.amount).gt(0))
    .sort((a, b) => a.siteId.localeCompare(b.siteId));
  const total = sum(positive.map((w) => w.amount));
  const target = new Decimal(amount).mul(100);
  if (!target.isInteger() || target.lt(0) || target.gt(total.mul(100)))
    throw new BadRequestError("Invalid site allocation");
  if (target.isZero())
    return positive.map((w) => ({ siteId: w.siteId, amount: "0.00" }));
  if (total.isZero()) throw new BadRequestError("No payable site balance");
  const shares = positive.map((w) => {
    const exact = target.mul(w.amount).div(total);
    return {
      siteId: w.siteId,
      paise: exact.floor(),
      remainder: exact.sub(exact.floor()),
    };
  });
  let left = target.sub(
    shares.reduce((s, v) => s.add(v.paise), new Decimal(0)),
  );
  const order = [...shares].sort(
    (a, b) =>
      b.remainder.comparedTo(a.remainder) || a.siteId.localeCompare(b.siteId),
  );
  for (const share of order) {
    if (left.lte(0)) break;
    share.paise = share.paise.add(1);
    left = left.sub(1);
  }
  return shares.map((s) => ({
    siteId: s.siteId,
    amount: money(s.paise.div(100)),
  }));
}

export async function buildPayroll(
  tx: Tx,
  actor: Actor,
  input: PeriodInput,
  currentId?: string,
) {
  const org = actor.organizationId;
  if (input.workerId) await references(tx, org, input.workerId, input.siteId);
  if (
    input.siteId &&
    !(await tx.site.findFirst({
      where: { id: input.siteId, organizationId: org },
    }))
  )
    throw new NotFoundError("Site not found");
  const policy = await settings(tx, org);
  const dates = {
    gte: new Date(input.startDate),
    lte: new Date(`${input.endDate}T23:59:59.999Z`),
  };
  const attendance = await tx.attendance.findMany({
    where: {
      organizationId: org,
      attendanceDate: dates,
      ...(input.workerId ? { workerId: input.workerId } : {}),
      ...(input.siteId ? { siteId: input.siteId } : {}),
      submission: { organizationId: org, status: "APPROVED" },
    },
    include: {
      worker: {
        include: {
          wageRates: { orderBy: { effectiveFrom: "desc" } },
          siteAssignments: true,
        },
      },
      site: true,
    },
    orderBy: [{ workerId: "asc" }, { attendanceDate: "asc" }],
  });
  const claims = await tx.payrollSourceClaim.findMany({
    where: {
      organizationId: org,
      attendanceId: { in: attendance.map((a) => a.id) },
    },
  });
  if (claims.some((c) => c.payrollId !== currentId))
    throw new ConflictError(
      "Source attendance is already reserved or finalized in another payroll",
    );
  const adjustments = await tx.payrollAdjustment.findMany({
    where: {
      organizationId: org,
      date: dates,
      ...(input.workerId ? { workerId: input.workerId } : {}),
      ...(input.siteId ? { siteId: input.siteId } : {}),
      OR: [...missing.OR, ...(currentId ? [{ payrollId: currentId }] : [])],
    },
    orderBy: { id: "asc" },
  });
  const workerIds = [
    ...new Set([
      ...attendance.map((a) => a.workerId),
      ...adjustments.map((a) => a.workerId),
    ]),
  ].sort();
  const exactRates = await tx.financialWageRate.findMany({
    where: { organizationId: org, workerId: { in: workerIds } },
    orderBy: { effectiveFrom: "desc" },
  });
  const supplements = await tx.financialWorkSupplement.findMany({
    where: {
      organizationId: org,
      attendanceId: { in: attendance.map((a) => a.id) },
    },
  });
  const recoveries: { advanceId: string; workerId: string; amount: string }[] =
    [];
  const seen = new Set<string>();
  for (const request of input.recoveries) {
    if (seen.has(request.advanceId))
      throw new BadRequestError("Duplicate advance allocation");
    seen.add(request.advanceId);
    const advance = await tx.workerAdvance.findFirst({
      where: { id: request.advanceId, organizationId: org },
    });
    if (!advance || !workerIds.includes(advance.workerId))
      throw new BadRequestError("Advance does not belong to a payroll worker");
    const prior = await tx.advanceRecovery.findMany({
      where: {
        organizationId: org,
        advanceId: advance.id,
        status: { in: ["RESERVED", "APPLIED"] },
        ...(currentId ? { payrollId: { not: currentId } } : {}),
      },
    });
    validateRecovery(
      {
        status: advance.status,
        issued: advance.amount,
        recovered: money(sum(prior.map((p) => p.amount))),
      },
      request.amount,
    );
    recoveries.push({ ...request, workerId: advance.workerId });
  }
  const items = [];
  for (const workerId of workerIds) {
    const worker = await references(tx, org, workerId);
    const sources = attendance.filter((a) => a.workerId === workerId);
    const components: WageComponent[] = [];
    for (const source of sources) {
      if (
        source.site.organizationId !== org ||
        source.worker.organizationId !== org
      )
        throw new ConflictError("Attendance tenant mismatch");
      const sourceDate = day(source.attendanceDate);
      const assignment = source.worker.siteAssignments.some(
        (a) =>
          a.siteId === source.siteId &&
          day(a.startDate) <= sourceDate &&
          (!a.endDate || day(a.endDate) > sourceDate),
      );
      if (
        !assignment ||
        (source.worker.archivedAt &&
          day(source.worker.archivedAt) <= sourceDate)
      )
        throw new BadRequestError(
          "Attendance is outside the worker employment/site dates",
        );
      const exact = exactRates.find(
        (r) => r.workerId === workerId && day(r.effectiveFrom) <= sourceDate,
      );
      const legacy = source.worker.wageRates.find(
        (r) =>
          day(r.effectiveFrom) <= sourceDate &&
          (!r.effectiveTo || day(r.effectiveTo) > sourceDate),
      );
      if (!exact && !legacy)
        throw new BadRequestError("Missing effective wage rate");
      const selected: HistoricalRate = exact
        ? {
            id: exact.id,
            type: exact.type as HistoricalRate["type"],
            amount: exact.amount,
            effectiveFrom: sourceDate,
          }
        : {
            id: legacy!.id,
            type: legacy!.wageType,
            amount: String(legacy!.rate),
            effectiveFrom: sourceDate,
          };
      const supplement = supplements.find((s) => s.attendanceId === source.id);
      if (supplement?.paidLeave && source.status !== "ABSENT")
        throw new BadRequestError(
          "Paid leave supplement requires approved absence",
        );
      const result = calculateWages(
        [
          {
            id: source.id,
            version: source.version,
            workerId,
            siteId: source.siteId,
            date: sourceDate,
            status: supplement?.paidLeave ? "PAID_LEAVE" : source.status,
            approved: true,
            ...(supplement
              ? {
                  overtimeHours: supplement.overtimeHours,
                  overtimeRate: supplement.overtimeRate,
                }
              : {}),
            ...(selected.type === "HOURLY" && source.hoursWorked !== null
              ? { hours: String(source.hoursWorked) }
              : {}),
          },
        ],
        { [workerId]: [selected] },
        {
          ...policy,
          periodAbsenceRule: policy.periodAbsenceRule as "UNPAID" | "PAID",
        },
      );
      components.push(...result.components);
    }
    const ownAdjustments = adjustments.filter((a) => a.workerId === workerId);
    const recovery = money(
      sum(
        recoveries.filter((r) => r.workerId === workerId).map((r) => r.amount),
      ),
    );
    const amounts = settleAmounts(
      money(sum(components.map((c) => c.gross))),
      ownAdjustments.map((a) => ({
        id: a.id,
        type: a.type as "BONUS" | "DEDUCTION",
        amount: a.amount,
        reason: a.reason,
        approvedBy: a.approvedBy,
        statutory: false,
      })),
      recovery,
    );
    const siteMap = new Map<string, Decimal>();
    for (const c of components)
      siteMap.set(
        c.siteId,
        (siteMap.get(c.siteId) ?? new Decimal(0)).add(c.gross),
      );
    for (const a of ownAdjustments)
      siteMap.set(
        a.siteId,
        (siteMap.get(a.siteId) ?? new Decimal(0)).add(
          a.type === "BONUS" ? a.amount : new Decimal(a.amount).negated(),
        ),
      );
    if ([...siteMap.values()].some((v) => v.lt(0)))
      throw new BadRequestError(
        "Site deductions exceed site earnings; allocate the correction to a payable site",
      );
    const sites = [...siteMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([siteId, v]) => ({ siteId, amount: money(v) }));
    const recoverySites = allocate(recovery, sites);
    const payableSites = sites.map((s) => ({
      siteId: s.siteId,
      amount: money(
        new Decimal(s.amount).sub(
          recoverySites.find((r) => r.siteId === s.siteId)?.amount ?? "0",
        ),
      ),
    }));
    items.push({
      workerId,
      workerName: worker.name,
      workerCode: worker.code,
      ...amounts,
      components,
      adjustments: ownAdjustments.map((a) => ({
        id: a.id,
        siteId: a.siteId,
        date: day(a.date),
        type: a.type,
        amount: a.amount,
        reason: a.reason,
      })),
      payableSites,
      recoverySites,
    });
  }
  if (!items.length)
    throw new BadRequestError(
      "No approved attendance or authorized adjustments in this period",
    );
  return {
    policy: {
      paidLeave: policy.paidLeave,
      periodAbsenceRule: policy.periodAbsenceRule,
      monthlyDivisor: policy.monthlyDivisor,
      weeklyDivisor: policy.weeklyDivisor,
      paidLeaveHours: policy.paidLeaveHours,
    },
    input,
    items,
    recoveries,
  };
}

export async function savePayroll(
  tx: Tx,
  actor: Actor,
  input: PeriodInput,
  existingId?: string,
) {
  const org = actor.organizationId;
  if (existingId && (await payroll(tx, org, existingId)).status !== "DRAFT")
    throw new ConflictError("Only draft payroll can be recalculated");
  const built = await buildPayroll(tx, actor, input, existingId);
  const data = {
    name: input.name,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    frequency: input.frequency,
    policy: json(built),
  };
  const period = existingId
    ? await tx.payrollPeriod.update({ where: { id: existingId }, data })
    : await tx.payrollPeriod.create({
        data: { ...data, organizationId: org, createdBy: actor.id },
      });
  if (existingId) {
    await tx.payrollItem.deleteMany({
      where: { organizationId: org, payrollId: period.id },
    });
    await tx.payrollSourceClaim.deleteMany({
      where: { organizationId: org, payrollId: period.id },
    });
    await tx.advanceRecovery.deleteMany({
      where: { organizationId: org, payrollId: period.id, status: "RESERVED" },
    });
    await tx.payrollAdjustment.updateMany({
      where: { organizationId: org, payrollId: period.id },
      data: { payrollId: null },
    });
  }
  for (const item of built.items) {
    await tx.payrollItem.create({
      data: {
        organizationId: org,
        payrollId: period.id,
        workerId: item.workerId,
        workerName: item.workerName,
        workerCode: item.workerCode,
        gross: item.gross,
        bonus: item.bonus,
        deductions: item.deductions,
        recovery: item.recovery,
        net: item.net,
        components: json(item.components),
        adjustments: json(item.adjustments),
      },
    });
    for (const c of item.components)
      await tx.payrollSourceClaim.create({
        data: {
          organizationId: org,
          payrollId: period.id,
          attendanceId: c.sourceId,
          sourceVersion: c.sourceVersion,
        },
      });
    for (const a of item.adjustments)
      await tx.payrollAdjustment.update({
        where: { id: a.id },
        data: { payrollId: period.id },
      });
  }
  for (const recovery of built.recoveries)
    await tx.advanceRecovery.create({
      data: { ...recovery, organizationId: org, payrollId: period.id },
    });
  await audit(
    tx,
    actor,
    existingId ? "PAYROLL_RECALCULATED" : "PAYROLL_CREATED",
    period.id,
    built,
  );
  return payroll(tx, org, period.id);
}

async function ledger(
  tx: Tx,
  actor: Actor,
  data: Omit<
    Prisma.LedgerEntryUncheckedCreateInput,
    "organizationId" | "createdBy"
  >,
) {
  return tx.ledgerEntry.create({
    data: {
      ...data,
      organizationId: actor.organizationId,
      createdBy: actor.id,
    },
  });
}
export async function transition(
  tx: Tx,
  actor: Actor,
  id: string,
  action: string,
  reason?: string,
) {
  const period = await payroll(tx, actor.organizationId, id);
  const user = await authorize(tx, actor);
  if (
    ["approve", "finalize", "cancel"].includes(action) &&
    user.role !== "OWNER"
  ) {
    const permitted =
      action === "approve" &&
      (await settings(tx, actor.organizationId)).accountantCanApprove;
    if (!permitted)
      throw new ForbiddenError(
        "Only an authorized owner can perform this action",
      );
  }
  if (action === "cancel") {
    if (["FINALIZED", "CANCELLED"].includes(period.status))
      throw new ConflictError(
        "Finalized or cancelled payroll cannot be cancelled",
      );
    await tx.payrollSourceClaim.deleteMany({
      where: { organizationId: actor.organizationId, payrollId: id },
    });
    await tx.advanceRecovery.deleteMany({
      where: {
        organizationId: actor.organizationId,
        payrollId: id,
        status: "RESERVED",
      },
    });
    await tx.payrollAdjustment.updateMany({
      where: { organizationId: actor.organizationId, payrollId: id },
      data: { payrollId: null },
    });
    await tx.payrollPeriod.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  } else {
    const expected: Record<string, string> = {
      submit: "DRAFT",
      approve: "PENDING_APPROVAL",
      finalize: "APPROVED",
    };
    if (period.status !== expected[action])
      throw new ConflictError("Invalid payroll transition");
    const frozen = period.policy as unknown as Awaited<
      ReturnType<typeof buildPayroll>
    >;
    const refreshed = await buildPayroll(tx, actor, frozen.input, id);
    if (canonical(refreshed) !== canonical(frozen))
      throw new ConflictError(
        "Attendance, rates, adjustments or settings changed. Return to draft and recalculate.",
      );
    if (action === "finalize") {
      for (const item of period.items) {
        const snapshot = frozen.items.find(
          (i) => i.workerId === item.workerId,
        )!;
        for (const c of snapshot.components) {
          await ledger(tx, actor, {
            workerId: item.workerId,
            siteId: c.siteId,
            payrollId: id,
            payrollItemId: item.id,
            type: "WAGE",
            amount: c.base,
            referenceId: c.sourceId,
            date: new Date(c.date),
            description: "Finalized approved attendance wage",
            idempotencyKey: `wage:${id}:${c.sourceId}`,
          });
          if (new Decimal(c.overtime).gt(0))
            await ledger(tx, actor, {
              workerId: item.workerId,
              siteId: c.siteId,
              payrollId: id,
              payrollItemId: item.id,
              type: "OVERTIME",
              amount: c.overtime,
              referenceId: c.sourceId,
              date: new Date(c.date),
              description: "Overtime",
              idempotencyKey: `overtime:${id}:${c.sourceId}`,
            });
        }
        for (const a of snapshot.adjustments)
          await ledger(tx, actor, {
            workerId: item.workerId,
            siteId: a.siteId,
            payrollId: id,
            payrollItemId: item.id,
            type: a.type,
            amount: a.amount,
            referenceId: a.id,
            date: new Date(a.date),
            description: a.reason,
            idempotencyKey: `adjustment:${a.id}`,
          });
        for (const s of snapshot.recoverySites.filter((s) =>
          new Decimal(s.amount).gt(0),
        ))
          await ledger(tx, actor, {
            workerId: item.workerId,
            siteId: s.siteId,
            payrollId: id,
            payrollItemId: item.id,
            type: "ADVANCE_RECOVERY",
            amount: s.amount,
            referenceId: item.id,
            date: period.endDate,
            description: "Confirmed advance recovery",
            idempotencyKey: `recovery:${item.id}:${s.siteId}`,
          });
      }
      for (const recovery of frozen.recoveries) {
        const advance = await tx.workerAdvance.findFirstOrThrow({
          where: {
            id: recovery.advanceId,
            organizationId: actor.organizationId,
          },
        });
        const item = period.items.find(
          (i) => i.workerId === recovery.workerId,
        )!;
        await ledger(tx, actor, {
          workerId: recovery.workerId,
          siteId: advance.siteId,
          payrollId: id,
          payrollItemId: item.id,
          type: "ADVANCE_BALANCE_RECOVERY",
          amount: recovery.amount,
          referenceId: advance.id,
          date: period.endDate,
          description:
            "Advance balance reduction at issuing site; not additional wage expense or cash",
          idempotencyKey: `advance-balance-recovery:${id}:${advance.id}`,
        });
      }
      await tx.advanceRecovery.updateMany({
        where: {
          organizationId: actor.organizationId,
          payrollId: id,
          status: "RESERVED",
        },
        data: { status: "APPLIED" },
      });
    }
    await tx.payrollPeriod.update({
      where: { id },
      data: {
        status:
          action === "submit"
            ? "PENDING_APPROVAL"
            : action === "approve"
              ? "APPROVED"
              : "FINALIZED",
        ...(action === "approve" ? { approvedBy: actor.id } : {}),
        ...(action === "finalize"
          ? { finalizedBy: actor.id, finalizedAt: new Date() }
          : {}),
      },
    });
  }
  await audit(tx, actor, `PAYROLL_${action.toUpperCase()}`, id, {
    reason: reason ?? null,
    snapshot: period.policy,
  });
  return payroll(tx, actor.organizationId, id);
}

export async function returnToDraft(
  tx: Tx,
  actor: Actor,
  id: string,
  reason: string,
) {
  const period = await payroll(tx, actor.organizationId, id);
  if (!["PENDING_APPROVAL", "APPROVED"].includes(period.status))
    throw new ConflictError(
      "Only unfinalized submitted payroll can return to draft",
    );
  await authorize(tx, actor, true);
  await tx.payrollPeriod.update({
    where: { id },
    data: { status: "DRAFT", approvedBy: null },
  });
  await audit(tx, actor, "PAYROLL_RETURNED_TO_DRAFT", id, { reason });
  return payroll(tx, actor.organizationId, id);
}

export async function createAdvance(
  tx: Tx,
  actor: Actor,
  input: {
    workerId: string;
    siteId: string;
    amount: string;
    date: string;
    method: string;
    reference: string;
  },
) {
  await references(tx, actor.organizationId, input.workerId, input.siteId);
  if (
    await tx.workerAdvance.findFirst({
      where: {
        organizationId: actor.organizationId,
        reference: input.reference,
        status: { not: "REVERSED" },
      },
    })
  )
    throw new ConflictError("Advance reference already recorded");
  if (
    await tx.workerPayment.findFirst({
      where: {
        organizationId: actor.organizationId,
        reference: input.reference,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    })
  )
    throw new ConflictError("Reference already recorded as a wage payment");
  const row = await tx.workerAdvance.create({
    data: {
      ...input,
      amount: money(new Decimal(input.amount)),
      date: actualDate(input.date),
      organizationId: actor.organizationId,
      createdBy: actor.id,
    },
  });
  await audit(tx, actor, "ADVANCE_REQUESTED", row.id, row);
  return row;
}
export async function advanceAction(
  tx: Tx,
  actor: Actor,
  id: string,
  action: "confirm" | "reverse",
  reason?: string,
) {
  const row = await tx.workerAdvance.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!row) throw new NotFoundError("Advance not found");
  if (action === "reverse") await authorize(tx, actor, true);
  if (
    row.status !== (action === "confirm" ? "PENDING" : "CONFIRMED") &&
    !(action === "reverse" && row.status === "PENDING")
  )
    throw new ConflictError("Invalid advance transition");
  if (
    action === "reverse" &&
    (await tx.advanceRecovery.count({
      where: {
        organizationId: actor.organizationId,
        advanceId: id,
        status: { in: ["RESERVED", "APPLIED"] },
      },
    }))
  )
    throw new ConflictError(
      "Advance has payroll recoveries; cancel reservations or make an audited settlement correction first",
    );
  if (action === "confirm")
    await ledger(tx, actor, {
      workerId: row.workerId,
      siteId: row.siteId,
      type: "ADVANCE_ISSUED",
      amount: row.amount,
      referenceId: id,
      date: row.date,
      description: "Manually confirmed advance issuance",
      idempotencyKey: `advance:${id}`,
    });
  if (action === "reverse" && row.status === "CONFIRMED") {
    const original = await tx.ledgerEntry.findFirstOrThrow({
      where: {
        organizationId: actor.organizationId,
        referenceId: id,
        type: "ADVANCE_ISSUED",
      },
    });
    await ledger(tx, actor, {
      workerId: row.workerId,
      siteId: row.siteId,
      type: "ADVANCE_REVERSAL",
      amount: row.amount,
      referenceId: id,
      date: new Date(),
      description: reason!,
      reversesId: original.id,
      idempotencyKey: `advance-reversal:${id}`,
    });
  }
  const result = await tx.workerAdvance.update({
    where: { id },
    data:
      action === "confirm"
        ? {
            status: "CONFIRMED",
            confirmedBy: actor.id,
            confirmedAt: new Date(),
          }
        : { status: "REVERSED", reversedBy: actor.id, reversalReason: reason },
  });
  await audit(tx, actor, `ADVANCE_${action.toUpperCase()}`, id, {
    before: row,
    after: result,
    reason,
  });
  return result;
}

async function paymentItem(tx: Tx, actor: Actor, id: string) {
  const item = await tx.payrollItem.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { payroll: true },
  });
  if (!item || item.payroll.organizationId !== actor.organizationId)
    throw new NotFoundError("Payroll item not found");
  if (item.payroll.status !== "FINALIZED")
    throw new ConflictError("Payments require finalized payroll");
  return item;
}
export async function createPayment(
  tx: Tx,
  actor: Actor,
  input: {
    payrollItemId: string;
    amount: string;
    date: string;
    method: string;
    reference: string;
  },
) {
  const item = await paymentItem(tx, actor, input.payrollItemId);
  if (
    await tx.workerPayment.findFirst({
      where: {
        organizationId: actor.organizationId,
        reference: input.reference,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    })
  )
    throw new ConflictError("Payment reference already recorded");
  if (
    await tx.workerAdvance.findFirst({
      where: {
        organizationId: actor.organizationId,
        reference: input.reference,
        status: { not: "REVERSED" },
      },
    })
  )
    throw new ConflictError("Reference already recorded as an advance");
  const existing = await tx.workerPayment.findMany({
    where: {
      organizationId: actor.organizationId,
      payrollItemId: item.id,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
  });
  if (
    sum(existing.map((p) => p.amount))
      .add(input.amount)
      .gt(item.net)
  )
    throw new ConflictError("Payment exceeds unreserved outstanding balance");
  const row = await tx.workerPayment.create({
    data: {
      ...input,
      amount: money(new Decimal(input.amount)),
      date: actualDate(input.date),
      organizationId: actor.organizationId,
      workerId: item.workerId,
      createdBy: actor.id,
      allocations: [],
    },
  });
  await audit(tx, actor, "PAYMENT_REQUESTED", row.id, row);
  return row;
}
export async function paymentAction(
  tx: Tx,
  actor: Actor,
  id: string,
  action: "confirm" | "reverse" | "cancel",
  reason?: string,
) {
  const row = await tx.workerPayment.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!row) throw new NotFoundError("Payment not found");
  const item = await paymentItem(tx, actor, row.payrollItemId);
  if (action === "reverse") await authorize(tx, actor, true);
  if (row.status !== (action === "reverse" ? "CONFIRMED" : "PENDING"))
    throw new ConflictError("Invalid payment transition");
  let allocations: SiteAmount[] = [];
  if (action === "confirm") {
    const frozen = item.payroll.policy as unknown as Awaited<
      ReturnType<typeof buildPayroll>
    >;
    const sites = frozen.items.find(
      (i) => i.workerId === item.workerId,
    )!.payableSites;
    const prior = await tx.workerPayment.findMany({
      where: {
        organizationId: actor.organizationId,
        payrollItemId: item.id,
        status: "CONFIRMED",
      },
    });
    const remaining = sites.map((site) => ({
      siteId: site.siteId,
      amount: money(
        new Decimal(site.amount).sub(
          sum(
            prior.flatMap((p) =>
              (p.allocations as unknown as SiteAmount[])
                .filter((a) => a.siteId === site.siteId)
                .map((a) => a.amount),
            ),
          ),
        ),
      ),
    }));
    allocations = allocate(row.amount, remaining);
    for (const a of allocations.filter((a) => new Decimal(a.amount).gt(0)))
      await ledger(tx, actor, {
        workerId: row.workerId,
        siteId: a.siteId,
        payrollId: item.payrollId,
        payrollItemId: item.id,
        type: "PAYMENT",
        amount: a.amount,
        referenceId: id,
        date: row.date,
        description: "Manually confirmed payment; not bank verified",
        idempotencyKey: `payment:${id}:${a.siteId}`,
      });
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
    });
    await tx.paymentReceipt.create({
      data: {
        organizationId: actor.organizationId,
        paymentId: id,
        snapshot: json({
          company: org.name,
          currency: org.currency,
          workerName: item.workerName,
          workerCode: item.workerCode,
          payroll: item.payroll.name,
          amount: row.amount,
          method: row.method,
          reference: row.reference,
          date: day(row.date),
          confirmedBy: actor.id,
          confirmation: "MANUALLY_CONFIRMED",
          notice:
            "Acknowledgment of a manually recorded payment. Not bank verification.",
          allocations,
        }),
      },
    });
  } else if (action === "reverse") {
    const originals = await tx.ledgerEntry.findMany({
      where: {
        organizationId: actor.organizationId,
        referenceId: id,
        type: "PAYMENT",
      },
    });
    for (const original of originals)
      await ledger(tx, actor, {
        workerId: row.workerId,
        siteId: original.siteId,
        payrollId: item.payrollId,
        payrollItemId: item.id,
        type: "PAYMENT_REVERSAL",
        amount: original.amount,
        referenceId: id,
        date: new Date(),
        description: reason!,
        reversesId: original.id,
        idempotencyKey: `payment-reversal:${original.id}`,
      });
  }
  const updated = await tx.workerPayment.update({
    where: { id },
    data:
      action === "confirm"
        ? {
            status: "CONFIRMED",
            confirmation: "MANUALLY_CONFIRMED",
            confirmedBy: actor.id,
            confirmedAt: new Date(),
            allocations: json(allocations),
          }
        : {
            status: action === "reverse" ? "REVERSED" : "CANCELLED",
            reversedBy: actor.id,
            reversalReason: reason,
          },
  });
  await audit(tx, actor, `PAYMENT_${action.toUpperCase()}`, id, {
    before: row,
    after: updated,
    reason,
  });
  return updated;
}

export async function listFinance(
  actor: Actor,
  kind: string,
  query: ListInput,
) {
  await authorize(prisma, actor);
  const org = actor.organizationId;
  const base = {
    organizationId: org,
    ...(query.workerId ? { workerId: query.workerId } : {}),
    ...(query.siteId ? { siteId: query.siteId } : {}),
  };
  const range = {
    ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
    ...(query.endDate
      ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) }
      : {}),
  };
  const dateFilter = Object.keys(range).length ? { date: range } : {};
  const status = query.status ? { status: query.status } : {};
  const pagination = {
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  };
  if (kind === "advances") {
    const where = { ...base, ...dateFilter, ...status };
    const [rows, total] = await Promise.all([
      prisma.workerAdvance.findMany({
        where,
        ...pagination,
        orderBy: [{ date: "desc" }, { id: "asc" }],
      }),
      prisma.workerAdvance.count({ where }),
    ]);
    const data = [];
    for (const row of rows) {
      const recoveries = await prisma.advanceRecovery.findMany({
        where: { organizationId: org, advanceId: row.id },
      });
      const recovered = sum(
        recoveries.filter((r) => r.status === "APPLIED").map((r) => r.amount),
      );
      const reserved = sum(
        recoveries.filter((r) => r.status === "RESERVED").map((r) => r.amount),
      );
      data.push({
        ...row,
        recovered: money(recovered),
        reserved: money(reserved),
        outstanding:
          row.status === "CONFIRMED"
            ? money(new Decimal(row.amount).sub(recovered))
            : "0.00",
        availableRecovery:
          row.status === "CONFIRMED"
            ? money(new Decimal(row.amount).sub(recovered).sub(reserved))
            : "0.00",
      });
    }
    return { data, total };
  }
  if (kind === "payments") {
    const where = {
      organizationId: org,
      ...(query.workerId ? { workerId: query.workerId } : {}),
      ...dateFilter,
      ...status,
    };
    return {
      data: await prisma.workerPayment.findMany({
        where,
        ...pagination,
        orderBy: [{ date: "desc" }, { id: "asc" }],
      }),
      total: await prisma.workerPayment.count({ where }),
    };
  }
  if (kind === "ledger") {
    const where = { ...base, ...dateFilter };
    return {
      data: await prisma.ledgerEntry.findMany({
        where,
        ...pagination,
        orderBy: [{ date: "desc" }, { id: "asc" }],
      }),
      total: await prisma.ledgerEntry.count({ where }),
    };
  }
  if (kind === "rates") {
    const where = {
      organizationId: org,
      ...(query.workerId ? { workerId: query.workerId } : {}),
    };
    return {
      data: await prisma.financialWageRate.findMany({
        where,
        ...pagination,
        orderBy: { effectiveFrom: "desc" },
      }),
      total: await prisma.financialWageRate.count({ where }),
    };
  }
  const where = {
    organizationId: org,
    ...status,
    ...(query.startDate ? { endDate: { gte: new Date(query.startDate) } } : {}),
    ...(query.endDate ? { startDate: { lte: new Date(query.endDate) } } : {}),
    ...(query.workerId
      ? { items: { some: { workerId: query.workerId } } }
      : {}),
  };
  const periods = await prisma.payrollPeriod.findMany({
    where,
    ...pagination,
    orderBy: [{ startDate: "desc" }, { id: "asc" }],
    include: { items: query.workerId ? { where: { workerId: query.workerId } } : true },
  });
  const paid = await prisma.workerPayment.findMany({
    where: {
      organizationId: org,
      payrollItemId: { in: periods.flatMap((p) => p.items.map((i) => i.id)) },
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
  });
  return {
    data: periods.map((p) => ({
      ...p,
      items: p.items.map((i) => ({
        ...i,
        ...paymentAvailability(
          i.net,
          paid
            .filter((payment) => payment.payrollItemId === i.id)
            .map((payment) => ({ amount: payment.amount, status: payment.status })),
        ),
      })),
    })),
    total: await prisma.payrollPeriod.count({ where }),
  };
}

export async function payrollDetail(actor: Actor, id: string) {
  await authorize(prisma, actor);
  const period = await payroll(prisma, actor.organizationId, id);
  const payments = await prisma.workerPayment.findMany({
    where: {
      organizationId: actor.organizationId,
      payrollItemId: { in: period.items.map((i) => i.id) },
    },
  });
  const claims = await prisma.payrollSourceClaim.findMany({
    where: { organizationId: actor.organizationId, payrollId: id },
  });
  const current = await prisma.attendance.findMany({
    where: {
      organizationId: actor.organizationId,
      id: { in: claims.map((c) => c.attendanceId) },
    },
  });
  return {
    ...period,
    sourceChanges: claims
      .filter(
        (c) =>
          current.find((a) => a.id === c.attendanceId)?.version !==
          c.sourceVersion,
      )
      .map((c) => c.attendanceId),
    items: period.items.map((i) => ({
      ...i,
      ...paymentAvailability(
        i.net,
        payments
          .filter((p) => p.payrollItemId === i.id)
          .map((p) => ({ amount: p.amount, status: p.status })),
      ),
      payments: payments.filter((p) => p.payrollItemId === i.id),
    })),
    audit: await prisma.payrollAuditLog.findMany({
      where: { organizationId: actor.organizationId, entityId: id },
      orderBy: { createdAt: "asc" },
    }),
  };
}

export async function createAdjustment(
  tx: Tx,
  actor: Actor,
  input: {
    workerId: string;
    siteId: string;
    date: string;
    amount: string;
    type: string;
    reason: string;
    correctsPayrollId?: string;
  },
) {
  await authorize(tx, actor, true);
  await references(tx, actor.organizationId, input.workerId, input.siteId);
  if (input.correctsPayrollId) {
    const corrected = await payroll(
      tx,
      actor.organizationId,
      input.correctsPayrollId,
    );
    if (
      corrected.status !== "FINALIZED" ||
      !corrected.items.some((i) => i.workerId === input.workerId)
    )
      throw new BadRequestError(
        "Correction must reference a finalized payroll for this worker",
      );
  }
  const row = await tx.payrollAdjustment.create({
    data: {
      ...input,
      amount: money(new Decimal(input.amount)),
      date: new Date(input.date),
      organizationId: actor.organizationId,
      createdBy: actor.id,
      approvedBy: actor.id,
    },
  });
  await audit(tx, actor, "ADJUSTMENT_AUTHORIZED", row.id, row);
  return row;
}
