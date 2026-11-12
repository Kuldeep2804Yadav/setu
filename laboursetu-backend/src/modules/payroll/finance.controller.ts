import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";
import { prisma } from "../../database/index.js";
import { ForbiddenError, NotFoundError } from "../../utils/errors.js";
import {
  audit,
  authorize,
  financialTransaction,
  json,
  type Tx,
  type Actor,
} from "./finance.repository.js";
import * as service from "./finance.service.js";
import * as schema from "./finance.schema.js";
import {
  excelReport,
  financialReport,
  pdfReport,
  type ReportKind,
} from "./finance.reports.js";

type Handler = (req: Request, res: Response) => Promise<unknown>;
export const handle =
  (run: Handler) => (req: Request, res: Response, next: NextFunction) => {
    void run(req, res).catch(next);
  };
const actor = (req: Request): Actor => req.user!;
export const mutate = (
  name: string,
  validator: ZodTypeAny,
  run: (tx: Tx, actor: Actor, input: any, id: string) => Promise<unknown>,
) =>
  handle(async (req, res) => {
    const input = validator.parse(req.body);
    const id = req.params.id ? schema.id.parse(req.params.id) : "";
    const result = await financialTransaction(
      actor(req),
      req.get("Idempotency-Key") ?? "",
      `${name}:${id}`,
      input,
      (tx) => run(tx, actor(req), input, id),
    );
    res.json({ success: true, data: result });
  });
export const list = (kind: string) =>
  handle(async (req, res) => {
    const query = schema.listSchema.parse(req.query);
    const result = await service.listFinance(actor(req), kind, query);
    res.json({
      success: true,
      data: result.data,
      meta: { page: query.page, limit: query.limit, total: result.total },
    });
  });
export const detail = handle(async (req, res) => {
  res.json({
    success: true,
    data: await service.payrollDetail(
      actor(req),
      schema.id.parse(req.params.id),
    ),
  });
});
export const preview = mutate("preview", schema.periodSchema, (tx, a, input) =>
  service.buildPayroll(tx, a, input),
);
export const createPayroll = mutate(
  "createPayroll",
  schema.periodSchema,
  (tx, a, input) => service.savePayroll(tx, a, input),
);
export const recalculate = mutate(
  "recalculate",
  schema.periodSchema,
  (tx, a, input, id) => service.savePayroll(tx, a, input, id),
);
export const createAdvance = mutate(
  "createAdvance",
  schema.advanceSchema,
  service.createAdvance,
);
export const createPayment = mutate(
  "createPayment",
  schema.paymentSchema,
  service.createPayment,
);
export const createAdjustment = mutate(
  "createAdjustment",
  schema.adjustmentSchema,
  service.createAdjustment,
);
export const getSettings = handle(async (req, res) => {
  await authorize(prisma, actor(req));
  res.json({
    success: true,
    data: await service.settings(prisma, req.user!.organizationId),
  });
});
export const saveSettings = mutate(
  "settings",
  schema.settingsSchema,
  async (tx, a, input) => {
    await authorize(tx, a, true);
    const before = await service.settings(tx, a.organizationId);
    const result = await tx.financeSettings.upsert({
      where: { organizationId: a.organizationId },
      create: {
        id: a.organizationId,
        organizationId: a.organizationId,
        ...input,
        updatedBy: a.id,
      },
      update: { ...input, updatedBy: a.id },
    });
    await audit(tx, a, "WAGE_SETTINGS_UPDATED", a.organizationId, {
      before,
      after: result,
    });
    return result;
  },
);
export const createRate = mutate(
  "rate",
  schema.rateSchema,
  async (tx, a, input) => {
    await authorize(tx, a, true);
    await service.references(tx, a.organizationId, input.workerId);
    const row = await tx.financialWageRate.create({
      data: {
        ...input,
        effectiveFrom: new Date(input.effectiveFrom),
        organizationId: a.organizationId,
        createdBy: a.id,
      },
    });
    await audit(tx, a, "EXACT_WAGE_RATE_CREATED", row.id, row);
    return row;
  },
);
export const createSupplement = mutate(
  "workSupplement",
  schema.supplementSchema,
  async (tx, a, input) => {
    await authorize(tx, a, true);
    const attendance = await tx.attendance.findFirst({
      where: {
        id: input.attendanceId,
        organizationId: a.organizationId,
        submission: { status: "APPROVED", organizationId: a.organizationId },
      },
    });
    if (!attendance) throw new NotFoundError("Approved attendance not found");
    const claim = await tx.payrollSourceClaim.findUnique({
      where: {
        organizationId_attendanceId: {
          organizationId: a.organizationId,
          attendanceId: input.attendanceId,
        },
      },
    });
    if (claim) {
      const period = await service.payroll(
        tx,
        a.organizationId,
        claim.payrollId,
      );
      if (period.status === "FINALIZED")
        throw new ForbiddenError(
          "Finalized attendance requires an authorized supplemental adjustment",
        );
    }
    if (
      input.paidLeave &&
      (attendance.status !== "ABSENT" ||
        !(await service.settings(tx, a.organizationId)).paidLeave)
    )
      throw new ForbiddenError(
        "Paid leave requires configured leave and approved absence",
      );
    if (input.paidLeave && !/^0(?:\.0+)?$/.test(input.overtimeHours))
      throw new ForbiddenError("Paid leave cannot include overtime");
    const row = await tx.financialWorkSupplement.create({
      data: { ...input, organizationId: a.organizationId, approvedBy: a.id },
    });
    await audit(tx, a, "WORK_SUPPLEMENT_AUTHORIZED", row.id, row);
    return row;
  },
);
export const report = (kind: ReportKind) =>
  handle(async (req, res) => {
    const { format, ...filters } = req.query;
    if (format && !["pdf", "xlsx", "json"].includes(String(format)))
      throw new NotFoundError("Unknown report format");
    const result = await financialReport(
      actor(req),
      kind,
      schema.listSchema.parse(filters),
    );
    if (!format || format === "json")
      return res.json({ success: true, data: result });
    const buffer =
      format === "pdf" ? await pdfReport(result) : await excelReport(result);
    res.setHeader(
      "Content-Type",
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="laboursetu-${kind}.${format}"`,
    );
    res.send(buffer);
  });
export const receipt = handle(async (req, res) => {
  await authorize(prisma, actor(req));
  const paymentId = schema.id.parse(req.params.id);
  const row = await prisma.paymentReceipt.findFirst({
    where: { paymentId, organizationId: req.user!.organizationId },
  });
  const payment = await prisma.workerPayment.findFirst({
    where: { id: paymentId, organizationId: req.user!.organizationId },
  });
  if (!row || !payment)
    throw new NotFoundError("Confirmed payment receipt not found");
  const snapshot = row.snapshot as Record<string, string>;
  if (req.query.format === "pdf") {
    const buffer = await pdfReport({
      company: snapshot.company,
      currency: snapshot.currency,
      title: `PAYMENT ACKNOWLEDGMENT — ${payment.status}`,
      period: snapshot.date,
      columns: ["Field", "Value"],
      rows: Object.entries(snapshot).filter(([, v]) => typeof v === "string"),
      totals: { amount: snapshot.amount },
      notice: `${snapshot.notice} Current payment status: ${payment.status}. ${payment.reversalReason ?? ""}`,
    });
    return res
      .type("pdf")
      .set(
        "Content-Disposition",
        `attachment; filename="receipt-${paymentId}.pdf"`,
      )
      .send(buffer);
  }
  return res.json({
    success: true,
    data: {
      ...row,
      paymentStatus: payment.status,
      reversalReason: payment.reversalReason,
    },
  });
});
