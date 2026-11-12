// Local visual QA fixture. Never connects to DATABASE_URL supplied by the user.
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
async function main() {
  process.env.MONGOMS_DOWNLOAD_DIR = path.resolve(".cache/mongodb");
  const replica = await MongoMemoryReplSet.create({
    binary: { version: "7.0.14" },
    replSet: { count: 1 },
  });
  process.env.DATABASE_URL = replica.getUri(
    `finance_ui_test_${randomUUID().replaceAll("-", "")}`,
  );
  process.env.NODE_ENV = "test";
  process.env.FRONTEND_URL = "http://localhost:3011";
  process.env.CORS_ORIGINS = "http://localhost:3011";
  const { prisma } = await import("../src/database/index.js");
  await (await import('./disposable-finance-schema.js')).initializeDisposableFinanceSchema(prisma);
  const { app } = await import("../src/app.js");
  const org = await prisma.organization.create({
    data: { name: "QA Construction", slug: randomUUID(), code: "QA" },
  });
  const argon2 = await import("argon2");
  await prisma.user.create({
    data: {
      organizationId: org.id,
      name: "QA Owner",
      email: "qa-owner@example.test",
      passwordHash: await argon2.hash("Temporary-QA-Only-2026!"),
      role: "OWNER",
    },
  });
  const site = await prisma.site.create({
    data: {
      organizationId: org.id,
      code: "QA-SITE",
      name: "Riverside construction",
    },
  });
  const worker = await prisma.worker.create({
    data: {
      organizationId: org.id,
      code: "QA-WRK",
      name: "QA Mason",
      normalizedName: "qa mason",
      trade: "Mason",
    },
  });
  await prisma.workerSiteAssignment.create({
    data: {
      workerId: worker.id,
      siteId: site.id,
      startDate: new Date("2026-01-01"),
    },
  });
  await prisma.wageRate.create({
    data: {
      workerId: worker.id,
      wageType: "DAILY",
      rate: 600,
      effectiveFrom: new Date("2026-01-01"),
    },
  });
  const submission = await prisma.attendanceSubmission.create({
    data: {
      organizationId: org.id,
      siteId: site.id,
      attendanceDate: new Date("2026-02-01"),
      status: "APPROVED",
    },
  });
  await prisma.attendance.create({
    data: {
      organizationId: org.id,
      siteId: site.id,
      workerId: worker.id,
      submissionId: submission.id,
      attendanceDate: new Date("2026-02-01"),
      status: "PRESENT",
      payableUnits: 1,
    },
  });
  const server = app.listen(5051, () =>
    console.log(
      "Disposable finance QA API ready on port 5051. Test login: qa-owner@example.test / Temporary-QA-Only-2026!",
    ),
  );
  const stop = () => {
    server.close();
    void prisma
      .$disconnect()
      .then(() => replica.stop())
      .then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
