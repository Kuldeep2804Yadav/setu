import { describe, expect, it } from "vitest";
import {
  calculateWages,
  decimal,
  paymentBalance,
  paymentAvailability,
  settleAmounts,
  validateRecovery,
  type HistoricalRate,
  type PayableWork,
  type WagePolicy,
} from "../../src/modules/payroll/calculation.js";

const policy: WagePolicy = {
  paidLeave: false,
  monthlyDivisor: "CALENDAR_MONTH",
  weeklyDivisor: "7",
};
const rate: HistoricalRate = {
  id: "rate1",
  effectiveFrom: "2026-01-01",
  type: "DAILY",
  amount: "600",
};
const day: PayableWork = {
  id: "att1",
  version: 1,
  workerId: "worker1",
  siteId: "site1",
  date: "2026-02-01",
  approved: true,
  status: "PRESENT",
};
const calculate = (
  work: PayableWork[] = [day],
  rates = [rate],
  rules = policy,
) => calculateWages(work, { worker1: rates }, rules);

describe("Phase 3 exact wage engine (database independent)", () => {
  it('separates outstanding wages from pending reservations using exact paise', () => {
    expect(paymentAvailability('0.60', [
      { status: 'CONFIRMED', amount: '0.10' },
      { status: 'PENDING', amount: '0.20' },
      { status: 'PENDING', amount: '0.10' },
      { status: 'CANCELLED', amount: '0.30' },
      { status: 'REVERSED', amount: '0.40' },
    ])).toEqual({ paid: '0.10', outstanding: '0.50', status: 'PARTIALLY_PAID', pending: '0.30', availablePayment: '0.20', canRecordPayment: true });
    expect(paymentAvailability('0.60', [{ status: 'PENDING', amount: '0.60' }])).toMatchObject({ status: 'UNPAID', availablePayment: '0.00', canRecordPayment: false });
    expect(paymentAvailability('0.60', [{ status: 'CONFIRMED', amount: '0.70' }])).toMatchObject({ status: 'OVERPAID', availablePayment: '0.00', canRecordPayment: false });
  });
  it("calculates daily wages", () => expect(calculate().gross).toBe("600.00"));
  it("calculates half days", () =>
    expect(calculate([{ ...day, status: "HALF_DAY" }]).gross).toBe("300.00"));
  it("calculates absent days", () =>
    expect(calculate([{ ...day, status: "ABSENT" }]).gross).toBe("0.00"));
  it("calculates hourly wages and rounds half up per component", () => {
    expect(
      calculate(
        [{ ...day, hours: "7.5" }],
        [{ ...rate, type: "HOURLY", amount: "133.35" }],
      ).gross,
    ).toBe("1000.13");
  });
  it("adds explicit overtime rates", () =>
    expect(
      calculate([{ ...day, overtimeHours: "2.5", overtimeRate: "100.25" }])
        .gross,
    ).toBe("850.63"));
  it("requires an explicit overtime rate", () =>
    expect(() => calculate([{ ...day, overtimeHours: "1" }])).toThrow());
  it("rejects overtime on absence and paid leave", () => {
    expect(() =>
      calculate([
        { ...day, status: "ABSENT", overtimeHours: "1", overtimeRate: "100" },
      ]),
    ).toThrow();
    expect(() =>
      calculate(
        [
          {
            ...day,
            status: "PAID_LEAVE",
            overtimeHours: "1",
            overtimeRate: "100",
          },
        ],
        [rate],
        { ...policy, paidLeave: true },
      ),
    ).toThrow();
  });
  it("uses rate intervals across mid-period changes", () => {
    const result = calculate(
      [day, { ...day, id: "att2", date: "2026-02-02" }],
      [
        { ...rate, effectiveTo: "2026-02-02" },
        { ...rate, id: "rate2", effectiveFrom: "2026-02-02", amount: "650" },
      ],
    );
    expect(result.gross).toBe("1250.00");
    expect(result.components.map((c) => c.rateId)).toEqual(["rate1", "rate2"]);
  });
  it("rejects ambiguous or missing historical rates", () => {
    expect(() => calculate([day], [])).toThrow();
    expect(() => calculate([day], [rate, { ...rate, id: "rate2" }])).toThrow();
  });
  it("preserves source site allocation on transfers", () => {
    const result = calculate([
      day,
      { ...day, id: "att2", date: "2026-02-02", siteId: "site2" },
    ]);
    expect(result.components.map((c) => [c.siteId, c.gross])).toEqual([
      ["site1", "600.00"],
      ["site2", "600.00"],
    ]);
    expect(result.gross).toBe("1200.00");
  });
  it("does not invent pay for dates without approved source work", () =>
    expect(calculate([]).gross).toBe("0.00"));
  it("uses actual calendar month lengths including leap years", () => {
    expect(
      calculate([day], [{ ...rate, type: "MONTHLY", amount: "28000" }]).gross,
    ).toBe("1000.00");
    expect(
      calculate(
        [{ ...day, date: "2028-02-29" }],
        [{ ...rate, type: "MONTHLY", amount: "29000" }],
      ).gross,
    ).toBe("1000.00");
  });
  it("supports an explicit monthly divisor without assuming thirty", () => {
    expect(
      calculate([day], [{ ...rate, type: "MONTHLY", amount: "26000" }], {
        ...policy,
        monthlyDivisor: "26",
      }).gross,
    ).toBe("1000.00");
  });
  it("supports configurable weekly proration", () =>
    expect(
      calculate([day], [{ ...rate, type: "WEEKLY", amount: "4200" }]).gross,
    ).toBe("600.00"));
  it("supports explicit paid-absence rules for period workers only", () => {
    expect(
      calculate(
        [{ ...day, status: "ABSENT" }],
        [{ ...rate, type: "MONTHLY", amount: "28000" }],
        { ...policy, periodAbsenceRule: "PAID" },
      ).gross,
    ).toBe("1000.00");
    expect(
      calculate([{ ...day, status: "ABSENT" }], [rate], {
        ...policy,
        periodAbsenceRule: "PAID",
      }).gross,
    ).toBe("0.00");
  });
  it("requires configured paid leave", () => {
    expect(() => calculate([{ ...day, status: "PAID_LEAVE" }])).toThrow();
    expect(
      calculate([{ ...day, status: "PAID_LEAVE" }], [rate], {
        ...policy,
        paidLeave: true,
      }).gross,
    ).toBe("600.00");
  });
  it("requires explicit hours for hourly paid leave", () => {
    expect(() =>
      calculate(
        [{ ...day, status: "PAID_LEAVE" }],
        [{ ...rate, type: "HOURLY" }],
        { ...policy, paidLeave: true },
      ),
    ).toThrow();
    expect(
      calculate(
        [{ ...day, status: "PAID_LEAVE" }],
        [{ ...rate, type: "HOURLY", amount: "100" }],
        { ...policy, paidLeave: true, paidLeaveHours: "8" },
      ).gross,
    ).toBe("800.00");
  });
  it("rejects unapproved work", () =>
    expect(() => calculate([{ ...day, approved: false }])).toThrow());
  it("rejects duplicate source records and duplicate worker days", () => {
    expect(() => calculate([day, day])).toThrow();
    expect(() =>
      calculate([day, { ...day, id: "att2", siteId: "site2" }]),
    ).toThrow();
  });
  it("rejects invalid dates and versions", () => {
    expect(() => calculate([{ ...day, date: "2026-02-30" }])).toThrow();
    expect(() => calculate([{ ...day, version: 0 }])).toThrow();
  });
  it("rejects invalid and negative decimal inputs", () => {
    for (const value of [
      "-1",
      "NaN",
      "Infinity",
      "1e10",
      "0.0000001",
      "1000000000000",
      "",
    ])
      expect(() => decimal(value)).toThrow();
    expect(() => decimal(12 as unknown as string)).toThrow();
    expect(() => calculate([day], [{ ...rate, amount: "0" }])).toThrow();
  });
  it("retains paise without floating point addition", () => {
    expect(paymentBalance("0.30", ["0.10", "0.20"])).toEqual({
      paid: "0.30",
      outstanding: "0.00",
      status: "PAID",
    });
  });
  it("tracks unpaid, partial, multiple and overpaid balances", () => {
    expect(paymentBalance("600", []).status).toBe("UNPAID");
    expect(paymentBalance("600", ["100"]).outstanding).toBe("500.00");
    expect(paymentBalance("600", ["100", "200"]).status).toBe("PARTIALLY_PAID");
    expect(paymentBalance("600", ["600"]).status).toBe("PAID");
    expect(paymentBalance("600", ["700"]).status).toBe("OVERPAID");
  });
  it("allows partial recovery across multiple advances", () => {
    expect(
      validateRecovery(
        { status: "CONFIRMED", issued: "1000", recovered: "200" },
        "300",
      ),
    ).toBe("500.00");
    expect(
      validateRecovery(
        { status: "CONFIRMED", issued: "500", recovered: "0" },
        "200",
      ),
    ).toBe("300.00");
  });
  it("rejects unconfirmed issuance and excessive recovery", () => {
    expect(() =>
      validateRecovery(
        { status: "PENDING", issued: "1000", recovered: "0" },
        "100",
      ),
    ).toThrow();
    expect(() =>
      validateRecovery(
        { status: "CONFIRMED", issued: "1000", recovered: "900" },
        "101",
      ),
    ).toThrow();
    expect(() =>
      validateRecovery(
        { status: "CONFIRMED", issued: "1000", recovered: "1000" },
        "1",
      ),
    ).toThrow();
  });
  it("applies authorized bonuses and deductions separately from recovery", () => {
    expect(
      settleAmounts(
        "600",
        [
          {
            id: "b",
            type: "BONUS",
            amount: "50",
            approvedBy: "owner",
            reason: "Bonus",
            statutory: false,
          },
          {
            id: "d",
            type: "DEDUCTION",
            amount: "20",
            approvedBy: "owner",
            reason: "Authorized",
            statutory: false,
          },
        ],
        "100",
      ),
    ).toEqual({
      gross: "600.00",
      bonus: "50.00",
      deductions: "20.00",
      recovery: "100.00",
      net: "530.00",
    });
  });
  it("rejects unvalidated statutory rules, unauthorized adjustments, and negative net pay", () => {
    const adjustment = {
      id: "d",
      type: "DEDUCTION" as const,
      amount: "20",
      approvedBy: "owner",
      reason: "Authorized",
      statutory: false,
    };
    expect(() =>
      settleAmounts("600", [{ ...adjustment, statutory: true }], "0"),
    ).toThrow();
    expect(() =>
      settleAmounts("600", [{ ...adjustment, approvedBy: "" }], "0"),
    ).toThrow();
    expect(() => settleAmounts("600", [adjustment, adjustment], "0")).toThrow();
    expect(() => settleAmounts("600", [], "601")).toThrow();
    expect(() =>
      settleAmounts("600", [{ ...adjustment, amount: "0.001" }], "0"),
    ).toThrow();
  });
  it("recalculates new versions without mutating previous calculation snapshots", () => {
    const original = calculate();
    const corrected = calculate([{ ...day, version: 2, status: "HALF_DAY" }]);
    expect(original.components[0].sourceVersion).toBe(1);
    expect(original.gross).toBe("600.00");
    expect(corrected.gross).toBe("300.00");
    expect(corrected.components[0].sourceVersion).toBe(2);
  });
});
