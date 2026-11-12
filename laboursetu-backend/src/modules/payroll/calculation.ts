import { Decimal } from "@prisma/client/runtime/library";

export class CalculationError extends Error {}

// Keep this module database-free. Only server-selected, approved source records belong here.
export type WageFrequency = "DAILY" | "HOURLY" | "WEEKLY" | "MONTHLY";
export interface HistoricalRate {
  id: string;
  effectiveFrom: string;
  effectiveTo?: string | null; // exclusive
  type: WageFrequency;
  amount: string;
}
export interface PayableWork {
  id: string;
  version: number;
  workerId: string;
  siteId: string;
  date: string;
  approved: boolean;
  status: "PRESENT" | "HALF_DAY" | "ABSENT" | "PAID_LEAVE";
  hours?: string;
  overtimeHours?: string;
  overtimeRate?: string;
}
export interface WagePolicy {
  paidLeave: boolean;
  periodAbsenceRule?: "UNPAID" | "PAID";
  // Period wages accrue per approved payable day; missing/absent days earn zero.
  // CALENDAR_MONTH uses the actual number of days in each source record's month.
  monthlyDivisor: "CALENDAR_MONTH" | string;
  weeklyDivisor: string;
  paidLeaveHours?: string;
}
export interface WageComponent {
  sourceId: string;
  sourceVersion: number;
  rateId: string;
  workerId: string;
  siteId: string;
  date: string;
  rate: string;
  units: string;
  base: string;
  overtime: string;
  gross: string;
}

export function decimal(value: string, positive = false): Decimal {
  if (typeof value !== "string" || !/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new CalculationError(
      "Expected a non-negative decimal string with at most six decimal places",
    );
  }
  const result = new Decimal(value);
  if (
    !result.isFinite() ||
    result.gt("999999999999.999999") ||
    (positive && result.lte(0))
  ) {
    throw new CalculationError("Decimal value out of range");
  }
  return result;
}

export function money(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function paise(value: string, positive = false): Decimal {
  const amount = decimal(value, positive);
  if (!amount.eq(money(amount)))
    throw new CalculationError("Amount must be expressed in paise");
  return amount;
}

export function dateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new CalculationError("Expected YYYY-MM-DD");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new CalculationError("Invalid calendar date");
  }
  return date;
}

/** Round each source's base and overtime separately, half-up to paise, then sum.
 * Historical rate intervals are [effectiveFrom, effectiveTo). Ambiguity fails closed.
 * Joining/leaving and site authorization are enforced by the source repository.
 */
export function calculateWages(
  work: PayableWork[],
  ratesByWorker: Record<string, HistoricalRate[]>,
  policy: WagePolicy,
): { components: WageComponent[]; gross: string } {
  const seen = new Set<string>();
  const workerDays = new Set<string>();
  const components = work.map((source): WageComponent => {
    const date = dateOnly(source.date);
    if (
      !["PRESENT", "HALF_DAY", "ABSENT", "PAID_LEAVE"].includes(source.status)
    )
      throw new CalculationError("Invalid attendance status");
    if (!source.id || !source.workerId || !source.siteId)
      throw new CalculationError("Source identity required");
    if (!source.approved)
      throw new CalculationError("Unapproved attendance cannot be paid");
    if (!Number.isInteger(source.version) || source.version < 1)
      throw new CalculationError("Invalid source version");
    if (
      seen.has(source.id) ||
      workerDays.has(`${source.workerId}:${source.date}`)
    ) {
      throw new CalculationError("Duplicate source work");
    }
    seen.add(source.id);
    workerDays.add(`${source.workerId}:${source.date}`);
    const applicable = (ratesByWorker[source.workerId] ?? []).filter((rate) => {
      dateOnly(rate.effectiveFrom);
      if (rate.effectiveTo) dateOnly(rate.effectiveTo);
      return (
        rate.effectiveFrom <= source.date &&
        (!rate.effectiveTo || source.date < rate.effectiveTo)
      );
    });
    if (applicable.length !== 1)
      throw new CalculationError(
        "Exactly one historical wage rate is required",
      );
    const rate = applicable[0];
    if (!["DAILY", "HOURLY", "WEEKLY", "MONTHLY"].includes(rate.type))
      throw new CalculationError("Invalid wage frequency");
    const amount = decimal(rate.amount, true);
    const leave = source.status === "PAID_LEAVE";
    if (leave && !policy.paidLeave)
      throw new CalculationError("Paid leave is not configured");
    const absent = source.status === "ABSENT";
    const paidAbsence =
      absent &&
      ["WEEKLY", "MONTHLY"].includes(rate.type) &&
      policy.periodAbsenceRule === "PAID";
    let units = new Decimal(
      absent && !paidAbsence ? "0" : source.status === "HALF_DAY" ? "0.5" : "1",
    );
    let divisor = new Decimal(1);
    if (rate.type === "HOURLY") {
      if (source.status === "HALF_DAY")
        throw new CalculationError("Hourly attendance requires actual hours");
      units = absent
        ? new Decimal(0)
        : decimal(
            leave ? (policy.paidLeaveHours ?? "") : (source.hours ?? ""),
            true,
          );
      if (units.gt(24)) throw new CalculationError("Hours must not exceed 24");
    } else if (source.hours !== undefined) {
      throw new CalculationError("Worked hours only apply to hourly wages");
    }
    if (absent && source.hours !== undefined && !decimal(source.hours).isZero())
      throw new CalculationError("Absent hours must be zero");
    if (rate.type === "WEEKLY") divisor = decimal(policy.weeklyDivisor, true);
    if (rate.type === "MONTHLY") {
      divisor =
        policy.monthlyDivisor === "CALENDAR_MONTH"
          ? new Decimal(
              new Date(
                Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
              ).getUTCDate(),
            )
          : decimal(policy.monthlyDivisor, true);
    }
    const overtimeHours = decimal(source.overtimeHours ?? "0");
    if (overtimeHours.gt(24) || ((absent || leave) && overtimeHours.gt(0)))
      throw new CalculationError("Invalid overtime hours");
    if (rate.type === "HOURLY" && units.add(overtimeHours).gt(24))
      throw new CalculationError("Total hours must not exceed 24");
    const overtime = overtimeHours.isZero()
      ? "0.00"
      : money(overtimeHours.mul(decimal(source.overtimeRate ?? "", true)));
    const base = money(amount.mul(units).div(divisor));
    return {
      sourceId: source.id,
      sourceVersion: source.version,
      rateId: rate.id,
      workerId: source.workerId,
      siteId: source.siteId,
      date: source.date,
      rate: amount.toFixed(),
      units: units.toFixed(),
      base,
      overtime,
      gross: money(new Decimal(base).add(overtime)),
    };
  });
  return {
    components,
    gross: money(
      components.reduce((sum, item) => sum.add(item.gross), new Decimal(0)),
    ),
  };
}

export interface ApprovedAdjustment {
  id: string;
  amount: string;
  type: "BONUS" | "DEDUCTION";
  approvedBy: string;
  reason: string;
  statutory: boolean;
}

export function settleAmounts(
  gross: string,
  adjustments: ApprovedAdjustment[],
  recovery: string,
) {
  let bonus = new Decimal(0);
  let deductions = new Decimal(0);
  const ids = new Set<string>();
  for (const adjustment of adjustments) {
    if (ids.has(adjustment.id))
      throw new CalculationError("Duplicate adjustment");
    ids.add(adjustment.id);
    if (!adjustment.approvedBy || !adjustment.reason.trim())
      throw new CalculationError("Adjustment authorization required");
    if (adjustment.statutory)
      throw new CalculationError(
        "Statutory deductions require separately validated applicable rules",
      );
    if (!["BONUS", "DEDUCTION"].includes(adjustment.type))
      throw new CalculationError("Invalid adjustment type");
    const amount = paise(adjustment.amount, true);
    if (adjustment.type === "BONUS") bonus = bonus.add(amount);
    else deductions = deductions.add(amount);
  }
  const recovered = paise(recovery);
  const net = paise(gross).add(bonus).sub(deductions).sub(recovered);
  if (net.lt(0))
    throw new CalculationError(
      "Deductions and recoveries exceed payable wages",
    );
  return {
    gross: money(decimal(gross)),
    bonus: money(bonus),
    deductions: money(deductions),
    recovery: money(recovered),
    net: money(net),
  };
}

export function paymentBalance(net: string, confirmedPayments: string[]) {
  const paid = confirmedPayments.reduce(
    (sum, amount) => sum.add(paise(amount, true)),
    new Decimal(0),
  );
  const balance = paise(net).sub(paid);
  return {
    paid: money(paid),
    outstanding: money(balance),
    status: balance.lt(0)
      ? "OVERPAID"
      : balance.isZero()
        ? "PAID"
        : paid.isZero()
          ? "UNPAID"
          : "PARTIALLY_PAID",
  };
}

// Must run inside the same locked transaction that appends the recovery ledger entry.
export function validateRecovery(
  advance: { status: string; issued: string; recovered: string },
  requested: string,
): string {
  if (advance.status !== "CONFIRMED")
    throw new CalculationError("Advance issuance is not confirmed");
  const amount = paise(requested, true);
  const outstanding = paise(advance.issued, true).sub(paise(advance.recovered));
  if (outstanding.lt(0) || amount.gt(outstanding))
    throw new CalculationError("Recovery exceeds outstanding advance");
  return money(outstanding.sub(amount));
}
