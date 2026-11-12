import { Decimal } from "@prisma/client/runtime/library";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../../database/index.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { authorize, type Actor } from "./finance.repository.js";
import { money } from "./calculation.js";
import type { ListInput } from "./finance.schema.js";

export const reportKinds = [
  "daily-cost",
  "weekly-wages",
  "monthly-payroll",
  "worker-statement",
  "advances",
  "pending-payments",
  "payment-history",
  "site-cost",
] as const;
export type ReportKind = (typeof reportKinds)[number];
export interface Report {
  company: string;
  currency: string;
  title: string;
  period: string;
  columns: string[];
  rows: string[][];
  totals: Record<string, string>;
  notice: string;
}
const add = (a: string, b: string) => money(new Decimal(a).add(b));
export function ledgerTotals(entries: { type: string; amount: string }[]) {
  let expense = "0.00",
    paid = "0.00",
    recovery = "0.00",
    advances = "0.00",
    advanceRecovered = "0.00";
  for (const entry of entries) {
    if (["WAGE", "OVERTIME", "BONUS"].includes(entry.type))
      expense = add(expense, entry.amount);
    if (entry.type === "DEDUCTION")
      expense = add(expense, new Decimal(entry.amount).negated().toFixed(2));
    if (entry.type === "PAYMENT") paid = add(paid, entry.amount);
    if (entry.type === "PAYMENT_REVERSAL")
      paid = add(paid, new Decimal(entry.amount).negated().toFixed(2));
    if (entry.type === "ADVANCE_RECOVERY")
      recovery = add(recovery, entry.amount);
    if (entry.type === "ADVANCE_BALANCE_RECOVERY")
      advanceRecovered = add(advanceRecovered, entry.amount);
    if (entry.type === "ADVANCE_ISSUED") advances = add(advances, entry.amount);
    if (entry.type === "ADVANCE_REVERSAL")
      advances = add(advances, new Decimal(entry.amount).negated().toFixed(2));
  }
  return {
    wageExpense: expense,
    wagePayments: paid,
    advanceIssued: advances,
    advanceRecovery: recovery,
    advanceRecovered,
    advanceOutstanding: money(new Decimal(advances).sub(advanceRecovered)),
    wageOutstanding: money(new Decimal(expense).sub(recovery).sub(paid)),
  };
}
export async function financialReport(
  actor: Actor,
  kind: ReportKind,
  query: ListInput,
): Promise<Report> {
  return prisma.$transaction(
    async (tx) => {
      await authorize(tx, actor);
      const org = actor.organizationId;
      if (
        query.workerId &&
        !(await tx.worker.findFirst({
          where: { id: query.workerId, organizationId: org },
        }))
      )
        throw new NotFoundError("Worker not found");
      if (
        query.siteId &&
        !(await tx.site.findFirst({
          where: { id: query.siteId, organizationId: org },
        }))
      )
        throw new NotFoundError("Site not found");
      const company = await tx.organization.findUniqueOrThrow({
        where: { id: org },
      });
      const base = {
        organizationId: org,
        ...(query.workerId ? { workerId: query.workerId } : {}),
        ...(query.siteId ? { siteId: query.siteId } : {}),
      };
      const until = query.endDate
        ? new Date(`${query.endDate}T23:59:59.999Z`)
        : undefined;
      if (
        (await tx.ledgerEntry.count({
          where: { ...base, ...(until ? { date: { lte: until } } : {}) },
        })) > 10000
      )
        throw new BadRequestError(
          "Report exceeds 10,000 ledger rows; narrow worker/site filters",
        );
      const all = await tx.ledgerEntry.findMany({
        where: { ...base, ...(until ? { date: { lte: until } } : {}) },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      });
      const entries = all.filter(
        (e) =>
          !query.startDate ||
          e.date.toISOString().slice(0, 10) >= query.startDate,
      );
      const periodTotals = ledgerTotals(kind === 'pending-payments' ? all : entries);
      const closing = ledgerTotals(all);
      const totals = {
        ...periodTotals,
        wageOutstanding: closing.wageOutstanding,
        advanceOutstanding: closing.advanceOutstanding,
      };
      const [workers, sites] = await Promise.all([
        tx.worker.findMany({
          where: { organizationId: org },
          select: { id: true, name: true, code: true },
        }),
        tx.site.findMany({
          where: { organizationId: org },
          select: { id: true, name: true },
        }),
      ]);
      const worker = (id: string) => workers.find((w) => w.id === id);
      const site = (id: string) => sites.find((s) => s.id === id)?.name ?? id;
      const result: Report = {
        company: company.name,
        currency: company.currency,
        title: kind.replaceAll("-", " ").toUpperCase(),
        period: `${query.startDate ?? "All dates"} to ${query.endDate ?? "present"}`,
        columns: [],
        rows: [],
        totals,
        notice:
          "Wage expense uses finalized ledger entries. Cash payments and advances are separate. Outstanding balances include all history through the end date. Payments are manually confirmed, not bank verified.",
      };
      if (kind === "worker-statement") {
        result.columns = [
          "Date",
          "Worker ID",
          "Worker",
          "Site",
          "Transaction",
          "Amount",
          "Reference",
        ];
        result.rows = entries.map((e) => [
          e.date.toISOString().slice(0, 10),
          worker(e.workerId)?.code ?? e.workerId,
          worker(e.workerId)?.name ?? e.workerId,
          site(e.siteId),
          e.type,
          e.amount,
          e.referenceId,
        ]);
      } else if (kind === "payment-history") {
        const rows = await tx.workerPayment.findMany({
          where: {
            organizationId: org,
            ...(query.workerId ? { workerId: query.workerId } : {}),
            ...(query.status ? { status: query.status } : {}),
            date: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(until ? { lte: until } : {}),
            },
          },
          take: 10001,
          orderBy: { date: "asc" },
        });
        if (rows.length > 10000)
          throw new BadRequestError("Report exceeds 10,000 payment rows");
        result.columns = [
          "Date",
          "Worker ID",
          "Worker",
          "Amount",
          "Method",
          "Reference",
          "Status",
          "Confirmation",
        ];
        result.rows = rows
          .filter(
            (p) =>
              !query.siteId ||
              (p.allocations as unknown as { siteId: string }[]).some(
                (a) => a.siteId === query.siteId,
              ),
          )
          .map((p) => [
            p.date.toISOString().slice(0, 10),
            worker(p.workerId)?.code ?? p.workerId,
            worker(p.workerId)?.name ?? p.workerId,
            query.siteId ? money((p.allocations as unknown as {siteId:string;amount:string}[]).filter(a=>a.siteId===query.siteId).reduce((total,a)=>total.add(a.amount),new Decimal(0))) : p.amount,
            p.method,
            p.reference ?? "",
            p.status,
            p.confirmation,
          ]);
      } else if (kind === "advances") {
        const rows = await tx.workerAdvance.findMany({
          where: {
            ...base,
            ...(query.status ? { status: query.status } : {}),
            date: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(until ? { lte: until } : {}),
            },
          },
          take: 10001,
          orderBy: { date: "asc" },
        });
        if (rows.length > 10000)
          throw new BadRequestError("Report exceeds 10,000 advances");
        result.columns = [
          "Date",
          "Worker ID",
          "Worker",
          "Site",
          "Issued",
          "Recovered",
          "Outstanding",
          "Status",
        ];
        for (const row of rows) {
          const recoveries = await tx.advanceRecovery.findMany({
            where: {
              organizationId: org,
              advanceId: row.id,
              status: "APPLIED",
            },
          });
          const periods = await tx.payrollPeriod.findMany({
            where: {
              organizationId: org,
              id: { in: recoveries.map((r) => r.payrollId) },
              ...(until ? { endDate: { lte: until } } : {}),
            },
          });
          const recovered = recoveries
            .filter((r) => periods.some((p) => p.id === r.payrollId))
            .reduce((s, r) => s.add(r.amount), new Decimal(0));
          result.rows.push([
            row.date.toISOString().slice(0, 10),
            worker(row.workerId)?.code ?? row.workerId,
            worker(row.workerId)?.name ?? row.workerId,
            site(row.siteId),
            row.amount,
            money(recovered),
            row.status === "CONFIRMED"
              ? money(new Decimal(row.amount).sub(recovered))
              : "0.00",
            row.status,
          ]);
        }
      } else {
        const groups = new Map<string, typeof entries>();
        for (const entry of ['pending-payments','site-cost'].includes(kind) ? all : entries) {
          const date = entry.date.toISOString().slice(0, 10);
          let bucket =
            kind === "daily-cost"
              ? date
              : kind === "monthly-payroll"
                ? date.slice(0, 7)
                : "";
          if (kind === "weekly-wages") {
            const monday = new Date(`${date}T00:00:00Z`);
            monday.setUTCDate(
              monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7),
            );
            bucket = monday.toISOString().slice(0, 10);
          }
          const key = JSON.stringify([bucket, entry.siteId, entry.workerId]);
          const group = groups.get(key) ?? [];
          group.push(entry);
          groups.set(key, group);
        }
        result.columns = [
          "Period",
          "Site",
          "Worker ID",
          "Worker",
          "Wage expense",
          "Overtime",
          "Advances issued",
          "Wage recovery",
          "Advance recovered",
          "Wage payments",
          "Wage balance",
        ];
        for (const [key, group] of groups) {
          const [bucket, siteId, workerId] = JSON.parse(key) as string[];
          const movements=kind==='site-cost'?group.filter(e=>!query.startDate||e.date.toISOString().slice(0,10)>=query.startDate):group;
          const t = ledgerTotals(movements);
          if (
            kind === "pending-payments" &&
            new Decimal(t.wageOutstanding).lte(0)
          )
            continue;
          const overtime = money(
            movements
              .filter((e) => e.type === "OVERTIME")
              .reduce((s, e) => s.add(e.amount), new Decimal(0)),
          );
          const closingForSite = ledgerTotals(
            all.filter((e) => e.siteId === siteId && e.workerId === workerId),
          );
          const balance = ["site-cost", "pending-payments"].includes(kind)
            ? closingForSite.wageOutstanding
            : t.wageOutstanding;
          result.rows.push([
            bucket || result.period,
            site(siteId),
            worker(workerId)?.code ?? workerId,
            worker(workerId)?.name ?? workerId,
            t.wageExpense,
            overtime,
            t.advanceIssued,
            t.advanceRecovery,
            t.advanceRecovered,
            t.wagePayments,
            balance,
          ]);
        }
      }
      return result;
    },
    { timeout: 30000 },
  );
}

export async function excelReport(report: Report): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "LabourSetu";
  const sheet = book.addWorksheet("Financial report");
  sheet.addRow([report.company]);
  sheet.addRow([report.title]);
  sheet.addRow([report.period, report.currency]);
  sheet.addRow([report.notice]);
  sheet.addRow([]);
  sheet.addRow(report.columns);
  report.rows.forEach((row) => sheet.addRow(row));
  sheet.addRow([]);
  Object.entries(report.totals).forEach(([key, value]) =>
    sheet.addRow([key, value]),
  );
  sheet.columns.forEach((c, i) => {
    c.width = i === 0 ? 25 : 22;
  });
  sheet.getRow(1).font = { bold: true, size: 16 };
  sheet.getRow(6).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(6).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  sheet.views = [{ state: "frozen", ySplit: 6 }];
  sheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: 6 + report.rows.length, column: report.columns.length },
  };
  return Buffer.from(await book.xlsx.writeBuffer());
}
export function pdfReport(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 30,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(17).text(report.company);
    doc.fontSize(12).text(`${report.title} (${report.currency})`);
    doc.fontSize(9).text(report.period);
    doc.moveDown().fontSize(8).text(report.notice);
    doc.moveDown();
    const width = (doc.page.width - 60) / Math.max(report.columns.length, 1);
    const draw = (row: string[], header: boolean) => {
      doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(7);
      const height = Math.max(
        22,
        ...row.map(
          (cell) => doc.heightOfString(cell, { width: width - 8 }) + 10,
        ),
      );
      if (doc.y + height > doc.page.height - 40) {
        doc.addPage();
        if (!header) draw(report.columns, true);
      }
      const y = doc.y;
      if (header) doc.rect(30, y, doc.page.width - 60, height).fill("#e2e8f0");
      doc.fillColor("#0f172a");
      row.forEach((cell, i) =>
        doc.text(cell, 30 + i * width, y + 5, { width: width - 8 }),
      );
      doc
        .moveTo(30, y + height)
        .lineTo(doc.page.width - 30, y + height)
        .strokeColor("#cbd5e1")
        .stroke();
      doc.y = y + height;
    };
    draw(report.columns, true);
    report.rows.forEach((row) => draw(row, false));
    doc.moveDown();
    for (const [key, value] of Object.entries(report.totals)) {
      if (doc.y > doc.page.height - 50) doc.addPage();
      doc.fontSize(9).text(`${key}: ${value}`);
    }
    const pages = doc.bufferedPageRange();
    for (let p = pages.start; p < pages.start + pages.count; p++) {
      doc.switchToPage(p);
      doc
        .fontSize(7)
        .text(`Page ${p + 1} of ${pages.count}`, 30, doc.page.height - 25, {
          lineBreak: false,
        });
    }
    doc.end();
  });
}
