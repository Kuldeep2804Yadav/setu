-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'HALF_DAY', 'ABSENT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WageEntryStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "EmailJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "attendance_submissions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedByUserId" UUID,
    "submittedAt" TIMESTAMP(3),
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedByUserId" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "hoursWorked" DECIMAL(5,2),
    "payableUnits" DECIMAL(5,2) NOT NULL,
    "notes" VARCHAR(300),
    "isCorrected" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wage_entries" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "wageRateId" UUID NOT NULL,
    "wageType" "WageType" NOT NULL,
    "rate" DECIMAL(10,2) NOT NULL,
    "payableUnits" DECIMAL(5,2) NOT NULL,
    "hoursWorked" DECIMAL(5,2),
    "grossWage" DECIMAL(10,2) NOT NULL,
    "status" "WageEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "approvedByUserId" UUID NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "correctionId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "previousStatus" "AttendanceStatus" NOT NULL,
    "previousHoursWorked" DECIMAL(5,2),
    "previousPayableUnits" DECIMAL(5,2) NOT NULL,
    "previousWageAmount" DECIMAL(10,2) NOT NULL,
    "newStatus" "AttendanceStatus" NOT NULL,
    "newHoursWorked" DECIMAL(5,2),
    "newPayableUnits" DECIMAL(5,2) NOT NULL,
    "newWageAmount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "recipient" VARCHAR(150) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "status" "EmailJobStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_entries" (
    "key" VARCHAR(150) NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "expireAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_entries_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "attendance_submissions_organizationId_status_idx" ON "attendance_submissions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "attendance_submissions_organizationId_attendanceDate_idx" ON "attendance_submissions"("organizationId", "attendanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_submissions_organizationId_siteId_attendanceDate_key" ON "attendance_submissions"("organizationId", "siteId", "attendanceDate");

-- CreateIndex
CREATE INDEX "attendances_submissionId_idx" ON "attendances"("submissionId");

-- CreateIndex
CREATE INDEX "attendances_organizationId_attendanceDate_idx" ON "attendances"("organizationId", "attendanceDate");

-- CreateIndex
CREATE INDEX "attendances_siteId_attendanceDate_idx" ON "attendances"("siteId", "attendanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_organizationId_workerId_attendanceDate_key" ON "attendances"("organizationId", "workerId", "attendanceDate");

-- CreateIndex
CREATE INDEX "wage_entries_organizationId_attendanceDate_idx" ON "wage_entries"("organizationId", "attendanceDate");

-- CreateIndex
CREATE INDEX "wage_entries_workerId_attendanceDate_idx" ON "wage_entries"("workerId", "attendanceDate");

-- CreateIndex
CREATE INDEX "wage_entries_siteId_attendanceDate_idx" ON "wage_entries"("siteId", "attendanceDate");

-- CreateIndex
CREATE INDEX "wage_entries_attendanceId_status_idx" ON "wage_entries"("attendanceId", "status");

-- CreateIndex
CREATE INDEX "attendance_corrections_organizationId_attendanceId_idx" ON "attendance_corrections"("organizationId", "attendanceId");

-- CreateIndex
CREATE INDEX "attendance_corrections_attendanceId_status_idx" ON "attendance_corrections"("attendanceId", "status");

-- CreateIndex
CREATE INDEX "email_outbox_status_nextAttemptAt_idx" ON "email_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "rate_limit_entries_expireAt_idx" ON "rate_limit_entries"("expireAt");

-- AddForeignKey
ALTER TABLE "attendance_submissions" ADD CONSTRAINT "attendance_submissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_submissions" ADD CONSTRAINT "attendance_submissions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_submissions" ADD CONSTRAINT "attendance_submissions_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_submissions" ADD CONSTRAINT "attendance_submissions_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_submissions" ADD CONSTRAINT "attendance_submissions_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "attendance_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_wageRateId_fkey" FOREIGN KEY ("wageRateId") REFERENCES "wage_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "attendance_corrections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

