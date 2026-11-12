import { Decimal } from '@prisma/client/runtime/library';
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomUUID, createHash } from "node:crypto";
import request from "supertest";
import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import type {
  Actor,
  Tx,
} from "../../src/modules/payroll/finance.repository.js";

let replica: MongoMemoryReplSet;
let db: PrismaClient;
let service: typeof import("../../src/modules/payroll/finance.service.js");
let repo: typeof import("../../src/modules/payroll/finance.repository.js");
let reports: typeof import("../../src/modules/payroll/finance.reports.js");
let app: (typeof import("../../src/app.js"))["app"];
let owner: Actor, accountant: Actor, supervisor: Actor, foreign: Actor;
let siteId: string, site2: string, workerId: string, attendanceId: string;
let periodId: string, itemId: string, advanceId: string, paymentId: string;
const input = () => ({
  name: "February 2026",
  startDate: "2026-02-01",
  endDate: "2026-02-02",
  frequency: "CUSTOM" as const,
  recoveries: [] as { advanceId: string; amount: string }[],

});
const mutate = <T>(
  operation: string,
  fn: (tx: Tx) => Promise<T>,
  actor = owner,
  key = randomUUID(),
) => repo.financialTransaction(actor, key, operation, {}, fn);

beforeAll(async () => {
  process.env.MONGOMS_DOWNLOAD_DIR = `${process.cwd()}/.cache/mongodb`;
  replica = await MongoMemoryReplSet.create({
    binary: { version: "7.0.14" },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const url = replica.getUri(
    `finance_test_${randomUUID().replaceAll("-", "")}`,
  );
  if (
    !url.startsWith("mongodb://127.0.0.1:") ||
    !url.includes("/finance_test_")
  )
    throw new Error("Unsafe disposable database URL");
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = "test";
  db = (await import("../../src/database/index.js")).prisma;
  await (await import('../../scripts/disposable-finance-schema.js')).initializeDisposableFinanceSchema(db);
  service = await import("../../src/modules/payroll/finance.service.js");
  repo = await import("../../src/modules/payroll/finance.repository.js");
  reports = await import("../../src/modules/payroll/finance.reports.js");
  app = (await import("../../src/app.js")).app;
  const org = await db.organization.create({
    data: { name: "Test Construction", slug: randomUUID(), code: "TEST" },
  });
  const other = await db.organization.create({
    data: { name: "Other Tenant", slug: randomUUID(), code: "OTHER" },
  });
  const user = async (
    role: "OWNER" | "ACCOUNTANT" | "SUPERVISOR",
    organizationId = org.id,
  ) => {
    const row = await db.user.create({
      data: {
        organizationId,
        email: `${randomUUID()}@example.test`,
        name: role,
        passwordHash: "unused",
        role,
      },
    });
    return { id: row.id, organizationId, role };
  };
  owner = await user("OWNER");
  accountant = await user("ACCOUNTANT");
  supervisor = await user("SUPERVISOR");
  foreign = await user("OWNER", other.id);
  siteId = (
    await db.site.create({
      data: { organizationId: org.id, code: "SITE1", name: "Site One" },
    })
  ).id;
  site2 = (
    await db.site.create({
      data: { organizationId: org.id, code: "SITE2", name: "Site Two" },
    })
  ).id;
  workerId = (
    await db.worker.create({
      data: {
        organizationId: org.id,
        code: "WRK1",
        name: "Worker One",
        normalizedName: "worker one",
        trade: "Mason",
      },
    })
  ).id;
  await db.wageRate.create({
    data: {
      workerId,
      wageType: "DAILY",
      rate: 600,
      effectiveFrom: new Date("2026-01-01"),
    },
  });
  await db.workerSiteAssignment.createMany({
    data: [
      {
        workerId,
        siteId,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-02-02"),
      },
      { workerId, siteId: site2, startDate: new Date("2026-02-02") },
    ],
  });
  for (const [date, site] of [
    ["2026-02-01", siteId],
    ["2026-02-02", site2],
  ]) {
    const submission = await db.attendanceSubmission.create({
      data: {
        organizationId: org.id,
        siteId: site,
        attendanceDate: new Date(date),
        status: "APPROVED",
        approvedByUserId: owner.id,
      },
    });
    const attendance = await db.attendance.create({
      data: {
        organizationId: org.id,
        submissionId: submission.id,
        workerId,
        siteId: site,
        attendanceDate: new Date(date),
        status: "PRESENT",
        payableUnits: 1,
      },
    });
    if (date === "2026-02-01") attendanceId = attendance.id;
  }
}, 180000);
afterAll(async () => {
  await db?.$disconnect();
  await replica?.stop();
});

describe.sequential("MongoDB Phase 3 transactional workflow", () => {
  it("applies forward-only finance migration twice without altering existing attendance", async () => {
    const { applyFinanceIndexes } =
      await import("../../src/modules/payroll/finance.indexes.js");
    await applyFinanceIndexes(db);
    await applyFinanceIndexes(db);
    expect(await db.attendance.count()).toBe(2);
  });
  it("requires confirmed issuance before advance recovery", async () => {
    const row = await mutate("advance", (tx) =>
      service.createAdvance(tx, owner, {
        workerId,
        siteId,
        amount: "500",
        date: "2026-02-01",
        method: "CASH",
        reference: "ADV-1",
      }),
    );
    advanceId = row.id;
    expect(row.status).toBe("PENDING");
    await expect(
      mutate("previewPending", (tx) =>
        service.buildPayroll(tx, owner, {
          ...input(),
          recoveries: [{ advanceId, amount: "100" }],
        }),
      ),
    ).rejects.toThrow("not confirmed");
    expect(await db.ledgerEntry.count()).toBe(0);
  });
  it("confirms advances explicitly and preserves issuer and confirmer", async () => {
    const row = await mutate("confirmAdvance", (tx) =>
      service.advanceAction(tx, owner, advanceId, "confirm"),
    );
    expect(row.confirmedBy).toBe(owner.id);
    expect(row.createdBy).toBe(owner.id);
    expect(
      await db.ledgerEntry.count({ where: { type: "ADVANCE_ISSUED" } }),
    ).toBe(1);
  });
  it("previews daily work across multiple sites without reserving sources", async () => {
    const built = await mutate("preview", (tx) =>
      service.buildPayroll(tx, owner, input()),
    );
    expect(built.items[0].gross).toBe("1200.00");
    expect(built.items[0].payableSites).toHaveLength(2);
    expect(await db.payrollSourceClaim.count()).toBe(0);
  });
  it("creates draft payroll with partial recovery and prevents overlapping source claims", async () => {
    const row = await mutate("createPayroll", (tx) =>
      service.savePayroll(tx, owner, {
        ...input(),
        recoveries: [{ advanceId, amount: "200" }],
      }),
    );
    periodId = row.id;
    itemId = row.items[0].id;
    expect(row.items[0].net).toBe("1000.00");
    await expect(
      mutate("duplicatePayroll", (tx) =>
        service.savePayroll(tx, owner, input()),
      ),
    ).rejects.toThrow("already reserved");
    expect(await db.advanceRecovery.count()).toBe(1);
  });
  it("recalculates drafts atomically without duplicate recovery", async () => {
    const row = await mutate("recalculate", (tx) =>
      service.savePayroll(
        tx,
        owner,
        { ...input(), recoveries: [{ advanceId, amount: "200" }] },
        periodId,
      ),
    );
    itemId = row.items[0].id;
    expect(await db.advanceRecovery.count()).toBe(1);
    expect(await db.payrollSourceClaim.count()).toBe(2);
    expect(row.items[0].net).toBe("1000.00");
  });
  it("rejects advance reversal with reserved recoveries", async () => {
    await expect(
      mutate("reverseReserved", (tx) =>
        service.advanceAction(tx, owner, advanceId, "reverse", "Wrong advance"),
      ),
    ).rejects.toThrow("recoveries");
  });
  it("enforces tenant isolation and supervisor denial in services", async () => {
    await expect(service.payrollDetail(foreign, periodId)).rejects.toThrow(
      "not found",
    );
    await expect(service.payrollDetail(supervisor, periodId)).rejects.toThrow(
      "not permitted",
    );
    await expect(
      mutate(
        "crossAdvance",
        (tx) =>
          service.createAdvance(tx, foreign, {
            workerId,
            siteId,
            amount: "100",
            date: "2026-02-01",
            method: "CASH",
            reference: "FOREIGN",
          }),
        foreign,
      ),
    ).rejects.toThrow("not found");
  });
  it("submits payroll and prevents accountant approval by default", async () => {
    await mutate("submit", (tx) =>
      service.transition(tx, owner, periodId, "submit"),
    );
    await expect(
      mutate(
        "accountantApprove",
        (tx) => service.transition(tx, accountant, periodId, "approve"),
        accountant,
      ),
    ).rejects.toThrow("owner");
  });
  it("approves and finalizes with exact reconcilable ledger balances", async () => {
    await mutate("approve", (tx) =>
      service.transition(tx, owner, periodId, "approve"),
    );
    const result = await mutate("finalize", (tx) =>
      service.transition(tx, owner, periodId, "finalize"),
    );
    expect(result.status).toBe("FINALIZED");
    const totals = reports.ledgerTotals(await db.ledgerEntry.findMany());
    expect(totals.wageExpense).toBe("1200.00");
    expect(totals.wageOutstanding).toBe("1000.00");
    expect(totals.advanceOutstanding).toBe("300.00");
  });
  it("keeps finalized payroll immutable and prevents duplicate finalization", async () => {
    await expect(
      mutate("recalcFinalized", (tx) =>
        service.savePayroll(tx, owner, input(), periodId),
      ),
    ).rejects.toThrow("Only draft");
    await expect(
      mutate("finalizeAgain", (tx) =>
        service.transition(tx, owner, periodId, "finalize"),
      ),
    ).rejects.toThrow("Invalid payroll");
  });
  it("records pending partial payments without asserting success", async () => {
    const payment = await mutate("payment", (tx) =>
      service.createPayment(tx, owner, {
        payrollItemId: itemId,
        amount: "300",
        date: "2026-02-03",
        method: "UPI",
        reference: "UPI-1",
      }),
    );
    paymentId = payment.id;
    expect(payment.status).toBe("PENDING");
    expect(payment.confirmation).toBe("UNCONFIRMED");
    expect(
      (await service.payrollDetail(owner, periodId)).items[0].outstanding,
    ).toBe("1000.00");
  });
  it("confirms partial payments manually and creates acknowledgment receipts", async () => {
    const payment = await mutate("confirmPayment", (tx) =>
      service.paymentAction(tx, owner, paymentId, "confirm"),
    );
    expect(payment.confirmation).toBe("MANUALLY_CONFIRMED");
    expect(
      (await service.payrollDetail(owner, periodId)).items[0].outstanding,
    ).toBe("700.00");
    expect(await db.paymentReceipt.count()).toBe(1);
  });
  it("retries identical keys and rejects changed payloads", async () => {
    const key = randomUUID();
    let count = 0;
    const fn = async () => {
      count++;
      return { id: "result" };
    };
    expect(
      await repo.financialTransaction(owner, key, "idem", { amount: "1" }, fn),
    ).toEqual({ id: "result" });
    expect(
      await repo.financialTransaction(owner, key, "idem", { amount: "1" }, fn),
    ).toEqual({ id: "result" });
    expect(count).toBe(1);
    await expect(
      repo.financialTransaction(owner, key, "idem", { amount: "2" }, fn),
    ).rejects.toThrow("another request");
  });
  it("prevents concurrent overpayment reservations", async () => {
    const results = await Promise.allSettled(
      ["A", "B"].map((ref) =>
        mutate(`concurrent${ref}`, (tx) =>
          service.createPayment(tx, owner, {
            payrollItemId: itemId,
            amount: "500",
            date: "2026-02-03",
            method: "CASH",
            reference: `CASH-${ref}`,
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const accepted = results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<{ id: string }>;
    await mutate("confirmSecond", (tx) =>
      service.paymentAction(tx, owner, accepted.value.id, "confirm"),
    );
    expect(
      (await service.payrollDetail(owner, periodId)).items[0].outstanding,
    ).toBe("200.00");
  });
  it("reverses payments using compensating ledger records", async () => {
    const before = await db.ledgerEntry.count();
    await mutate("reversePayment", (tx) =>
      service.paymentAction(
        tx,
        owner,
        paymentId,
        "reverse",
        "Payment recorded incorrectly",
      ),
    );
    expect(await db.ledgerEntry.count()).toBeGreaterThan(before);
    expect(
      (await service.payrollDetail(owner, periodId)).items[0].outstanding,
    ).toBe("500.00");
    expect(await db.paymentReceipt.count()).toBe(2);
  });
  it("keeps attendance corrections from altering finalized snapshots", async () => {
    await db.attendance.update({
      where: { id: attendanceId },
      data: { status: "HALF_DAY", version: { increment: 1 } },
    });
    const detail = await service.payrollDetail(owner, periodId);
    expect(detail.items[0].gross).toBe("1200.00");
    expect(detail.sourceChanges).toContain(attendanceId);
    await expect(
      mutate("duplicateCorrected", (tx) =>
        service.savePayroll(tx, owner, input()),
      ),
    ).rejects.toThrow("already reserved");
  });
  it("allows audited supplemental adjustments without paying original work twice", async () => {
    const correction = await mutate("adjustment", (tx) =>
      service.createAdjustment(tx, owner, {
        workerId,
        siteId,
        date: "2026-02-04",
        type: "BONUS",
        amount: "50",
        reason: "Authorized supplemental settlement",
        correctsPayrollId: periodId,
      }),
    );
    expect(correction.correctsPayrollId).toBe(periodId);
    const supplemental = await mutate("supplemental", (tx) =>
      service.savePayroll(tx, owner, {
        ...input(),
        startDate: "2026-02-04",
        endDate: "2026-02-04",
      }),
    );
    expect(supplemental.items[0].net).toBe("50.00");
  });
  it("returns reports that reconcile and creates readable PDF and Excel data", async () => {
    const report = await reports.financialReport(owner, "site-cost", {
      page: 1,
      limit: 100,
    });
    expect(report.totals.wageExpense).toBe("1200.00");
    expect(report.totals.wagePayments).toBe("500.00");
    expect(report.totals.wageOutstanding).toBe("500.00");
    const xlsx = await reports.excelReport(report);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(xlsx as any);
    expect(book.worksheets[0].getRow(1).getCell(1).value).toBe(
      "Test Construction",
    );
    expect(book.worksheets[0].getRow(7).values).toContain("Worker One");
    const pdf = await reports.pdfReport(report);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1000);
  });
  it("enforces endpoint auth, strict amounts and explicit confirmation", async () => {
    expect((await request(app).get("/api/v1/finance/payroll")).status).toBe(
      401,
    );
    const token = randomUUID();
    await db.session.create({
      data: {
        organizationId: owner.organizationId,
        userId: owner.id,
        token: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const bad = await request(app)
      .post("/api/v1/finance/payments")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        payrollItemId: itemId,
        amount: -1,
        date: "2026-02-03",
        method: "CASH",
        reference: "INVALID",
      });
    expect(bad.status).toBe(400);
    const confirm = await request(app)
      .post(`/api/v1/finance/payments/${paymentId}/confirm`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send({});
    expect(confirm.status).toBe(400);
    const supervisorToken = randomUUID();
    await db.session.create({
      data: {
        organizationId: supervisor.organizationId,
        userId: supervisor.id,
        token: createHash("sha256").update(supervisorToken).digest("hex"),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    expect(
      (
        await request(app)
          .get("/api/v1/finance/payroll")
          .set("Authorization", `Bearer ${supervisorToken}`)
      ).status,
    ).toBe(403);
  });
  it('runs the complete authenticated HTTP payroll-to-payment workflow',async()=>{
    const token=randomUUID();await db.session.create({data:{organizationId:owner.organizationId,userId:owner.id,token:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}});
    const post=(path:string,body:unknown,key=randomUUID())=>request(app).post(`/api/v1/finance${path}`).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
    const submission=await db.attendanceSubmission.create({data:{organizationId:owner.organizationId,siteId:site2,attendanceDate:new Date('2026-03-01'),status:'APPROVED'}});
    await db.attendance.create({data:{organizationId:owner.organizationId,siteId:site2,workerId,submissionId:submission.id,attendanceDate:new Date('2026-03-01'),status:'PRESENT',payableUnits:1}});
    const created=await post('/payroll',{...input(),startDate:'2026-03-01',endDate:'2026-03-01',recoveries:[{advanceId,amount:'100'}]});
    expect(created.status).toBe(200);const period=created.body.data;expect(period.items[0].net).toBe('500.00');
    for(const action of ['submit','approve','finalize'])expect((await post(`/payroll/${period.id}/${action}`,{})).status).toBe(200);
    const key=randomUUID();const body={payrollItemId:period.items[0].id,amount:'500',date:'2026-03-02',method:'BANK_TRANSFER',reference:'E2E-BANK-1'};
    const [p1,p2]=await Promise.all([post('/payments',body,key),post('/payments',body,key)]);
    expect(p1.status).toBe(200);expect(p2.status).toBe(200);expect(p1.body.data.id).toBe(p2.body.data.id);expect(p1.body.data.status).toBe('PENDING');
    const confirmed=await post(`/payments/${p1.body.data.id}/confirm`,{manuallyConfirmed:true});expect(confirmed.status).toBe(200);expect(confirmed.body.data.confirmation).toBe('MANUALLY_CONFIRMED');
    const detail=await request(app).get(`/api/v1/finance/payroll/${period.id}`).set('Authorization',`Bearer ${token}`);expect(detail.body.data.items[0].status).toBe('PAID');
    const receipt=await request(app).get(`/api/v1/finance/payments/${p1.body.data.id}/receipt?format=pdf`).set('Authorization',`Bearer ${token}`);expect(receipt.status).toBe(200);expect(receipt.headers['content-type']).toContain('application/pdf');
  });
  it('prevents concurrent recovery across separate payroll periods and releases cancelled reservations',async()=>{
    const advance=await mutate('secondAdvance',tx=>service.createAdvance(tx,owner,{workerId,siteId,amount:'500',date:'2026-04-01',method:'CASH',reference:'ADV-SECOND'}));
    await mutate('secondConfirm',tx=>service.advanceAction(tx,owner,advance.id,'confirm'));
    for(const date of ['2026-04-01','2026-04-02'])await mutate(`bonus${date}`,tx=>service.createAdjustment(tx,owner,{workerId,siteId:site2,date,type:'BONUS',amount:'600',reason:'Authorized bonus for recovery test'}));
    const results=await Promise.allSettled(['2026-04-01','2026-04-02'].map(date=>mutate(`recover${date}`,tx=>service.savePayroll(tx,owner,{...input(),startDate:date,endDate:date,recoveries:[{advanceId:advance.id,amount:'400'}]}))));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    const accepted=results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<{id:string}>;
    await mutate('cancelReservation',tx=>service.transition(tx,owner,accepted.value.id,'cancel','Cancel recovery reservation test'));
    expect(await db.advanceRecovery.count({where:{advanceId:advance.id}})).toBe(0);
  });
  it('reconciles site closing balances even in periods with no new wage activity',async()=>{
    const report=await reports.financialReport(owner,'site-cost',{page:1,limit:100,startDate:'2026-06-01'});
    const total=report.rows.reduce((v,row)=>v.add(row[row.length-1]),new Decimal(0)).toFixed(2);
    expect(total).toBe(report.totals.wageOutstanding);
    expect(report.totals.wageExpense).toBe('0.00');
    const siteReport=await reports.financialReport(owner,'site-cost',{page:1,limit:100,siteId});
    expect(siteReport.totals.advanceOutstanding).toBe('700.00');
  });
  it('integrates exact period rates, approved leave and overtime supplements through HTTP',async()=>{
    const token=randomUUID();await db.session.create({data:{organizationId:owner.organizationId,userId:owner.id,token:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+600000)}});
    const send=(method:'post'|'put',path:string,body:unknown)=>request(app)[method](`/api/v1/finance${path}`).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',randomUUID()).send(body);
    expect((await send('put','/settings',{paidLeave:true,monthlyDivisor:'CALENDAR_MONTH',weeklyDivisor:'7',paidLeaveHours:'8',periodAbsenceRule:'UNPAID',accountantCanApprove:true})).status).toBe(200);
    expect((await send('post','/rates',{workerId,type:'WEEKLY',amount:'4200',effectiveFrom:'2026-05-01'})).status).toBe(200);
    expect((await send('post','/rates',{workerId,type:'MONTHLY',amount:'31000',effectiveFrom:'2026-05-02'})).status).toBe(200);
    for(const date of ['2026-05-01','2026-05-02']){
      const absence=date.endsWith('01');const submission=await db.attendanceSubmission.create({data:{organizationId:owner.organizationId,siteId:site2,attendanceDate:new Date(date),status:'APPROVED'}});
      const source=await db.attendance.create({data:{organizationId:owner.organizationId,siteId:site2,workerId,submissionId:submission.id,attendanceDate:new Date(date),status:absence?'ABSENT':'PRESENT',payableUnits:absence?0:1}});
      expect((await send('post','/work-supplements',{attendanceId:source.id,paidLeave:absence,overtimeHours:absence?'0':'2',overtimeRate:absence?'0':'100',reason:'Owner authorized leave or overtime'})).status).toBe(200);
    }
    const created=await send('post','/payroll',{...input(),startDate:'2026-05-01',endDate:'2026-05-02'});expect(created.status).toBe(200);expect(created.body.data.items[0].gross).toBe('1800.00');
    await mutate('submitPeriodRules',tx=>service.transition(tx,owner,created.body.data.id,'submit'));
    expect((await mutate('explicitAccountantApprove',tx=>service.transition(tx,accountant,created.body.data.id,'approve'),accountant)).status).toBe('APPROVED');
    await expect(mutate('noAccountantFinalize',tx=>service.transition(tx,accountant,created.body.data.id,'finalize'),accountant)).rejects.toThrow('owner');
  });
});
