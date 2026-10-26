import {
  PrismaClient,
  Role,
  SiteStatus,
  WorkerStatus,
  VerificationStatus,
  WageType,
  AssignmentStatus,
  AttendanceStatus,
  SubmissionStatus,
  CorrectionStatus,
  WageEntryStatus,
  Prisma,
} from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true' || process.env.NODE_ENV === 'production') {
    throw new Error('Seed clears all data. Only run on a disposable development database with ALLOW_DESTRUCTIVE_SEED=true.');
  }
  console.log('🌱 Starting LabourSetu database seed...');

  // Clean existing data in reverse dependency order
  await prisma.attendanceCorrection.deleteMany();
  await prisma.wageEntry.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.attendanceSubmission.deleteMany();
  await prisma.rateLimitEntry.deleteMany();
  await prisma.emailOutbox.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.wageRate.deleteMany();
  await prisma.workerSiteAssignment.deleteMany();
  await prisma.supervisorSite.deleteMany();
  await prisma.worker.deleteMany();
  await prisma.site.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const passwordHash = await argon2.hash('Password123!', {
    type: argon2.argon2id,
  });

  // 1. Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'Shree Ram Constructions',
      slug: 'shree-ram-constructions',
      code: 'SRC',
      phone: '9820098200',
      address: 'Plot 42, Bandra Kurla Complex, Mumbai, Maharashtra 400051',
      gstin: '27AABCS1429B1Z2',
      currency: 'INR',
    },
  });

  console.log(`Created Organization: ${org.name} (${org.id})`);

  // 2. Create Users (Owner, Accountant, Supervisors)
  const owner = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: 'Rajesh Sharma',
      email: 'owner@shreeram.com',
      phone: '9820198201',
      passwordHash,
      role: Role.OWNER,
    },
  });

  const accountant = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: 'Pooja Verma',
      email: 'accountant@shreeram.com',
      phone: '9820298202',
      passwordHash,
      role: Role.ACCOUNTANT,
    },
  });

  const supervisor1 = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: 'Vikram Singh',
      email: 'supervisor@shreeram.com',
      phone: '9820398203',
      passwordHash,
      role: Role.SUPERVISOR,
    },
  });

  const supervisor2 = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: 'Ramesh Patel',
      email: 'ramesh.supervisor@shreeram.com',
      phone: '9820498204',
      passwordHash,
      role: Role.SUPERVISOR,
    },
  });

  console.log('Created Users: Owner, Accountant, 2 Supervisors');

  // 3. Create Sites
  const site1 = await prisma.site.create({
    data: {
      organizationId: org.id,
      code: 'SITE-ML4',
      name: 'Metro Line 4 - Thane Station',
      location: 'Eastern Express Highway, Thane West, Mumbai',
      clientName: 'MMRDA',
      status: SiteStatus.ACTIVE,
    },
  });

  const site2 = await prisma.site.create({
    data: {
      organizationId: org.id,
      code: 'SITE-GRT',
      name: 'Greenfield Residential Tower A',
      location: 'Sector 140A, Noida Expressway',
      clientName: 'Apex Infratech Ltd.',
      status: SiteStatus.ACTIVE,
    },
  });

  const site3 = await prisma.site.create({
    data: {
      organizationId: org.id,
      code: 'SITE-HFU',
      name: 'Highway Flyover & Underpass',
      location: 'Ring Road Junction, Bengaluru',
      clientName: 'NHAI',
      status: SiteStatus.ACTIVE,
    },
  });

  const siteArchived = await prisma.site.create({
    data: {
      organizationId: org.id,
      code: 'SITE-OLD',
      name: 'Riverside Commercial Complex (Phase 0)',
      location: 'Civil Lines, Nagpur',
      clientName: 'Kalyan Developers',
      status: SiteStatus.ARCHIVED,
      archivedAt: new Date('2026-01-15T10:00:00Z'),
    },
  });

  console.log('Created 4 Sites (3 Active, 1 Archived)');

  // 4. Assign Supervisors to Sites
  await prisma.supervisorSite.createMany({
    data: [
      { siteId: site1.id, userId: supervisor1.id },
      { siteId: site2.id, userId: supervisor1.id },
      { siteId: site3.id, userId: supervisor2.id },
    ],
  });

  // 5. Create Workers with Wage Rates & Site Assignments
  const workersData = [
    {
      code: 'WRK-001',
      name: 'Suresh Kumar',
      normalizedName: 'suresh kumar',
      mobileNumber: '9876543210',
      trade: 'Mason',
      verificationStatus: VerificationStatus.VERIFIED,
      aadhaarLastFour: '4512',
      siteId: site1.id,
      initialRate: 900.0,
      currentRate: 950.0,
      wageType: WageType.DAILY,
    },
    {
      code: 'WRK-002',
      name: 'Sunita Devi', // Legitimate shared family phone with Suresh Kumar
      normalizedName: 'sunita devi',
      mobileNumber: '9876543210',
      trade: 'Helper',
      verificationStatus: VerificationStatus.VERIFIED,
      aadhaarLastFour: '7823',
      siteId: site1.id,
      currentRate: 600.0,
      wageType: WageType.DAILY,
    },
    {
      code: 'WRK-003',
      name: 'Manoj Yadav',
      normalizedName: 'manoj yadav',
      mobileNumber: '9811223344',
      trade: 'Carpenter',
      verificationStatus: VerificationStatus.VERIFIED,
      aadhaarLastFour: '9012',
      siteId: site1.id,
      currentRate: 900.0,
      wageType: WageType.DAILY,
    },
    {
      code: 'WRK-004',
      name: 'Dinesh Prasad',
      normalizedName: 'dinesh prasad',
      mobileNumber: '9822334455',
      trade: 'Bar Bender',
      verificationStatus: VerificationStatus.AADHAAR_SUBMITTED,
      aadhaarLastFour: '3490',
      siteId: site2.id,
      currentRate: 1000.0,
      wageType: WageType.DAILY,
    },
    {
      code: 'WRK-005',
      name: 'Mohammad Imran',
      normalizedName: 'mohammad imran',
      mobileNumber: '9833445566',
      trade: 'Electrician',
      verificationStatus: VerificationStatus.VERIFIED,
      aadhaarLastFour: '1234',
      siteId: site2.id,
      currentRate: 140.0, // Hourly rate
      wageType: WageType.HOURLY,
    },
    {
      code: 'WRK-006',
      name: 'Bablu Sahni',
      normalizedName: 'bablu sahni',
      mobileNumber: '9844556677',
      trade: 'Helper',
      verificationStatus: VerificationStatus.UNVERIFIED,
      aadhaarLastFour: null,
      siteId: site2.id,
      currentRate: 580.0,
      wageType: WageType.DAILY,
    },
    {
      code: 'WRK-007',
      name: 'Amit Mondal',
      normalizedName: 'amit mondal',
      mobileNumber: '9855667788',
      trade: 'Tile Mistri',
      verificationStatus: VerificationStatus.VERIFIED,
      aadhaarLastFour: '6543',
      siteId: site3.id,
      currentRate: 1050.0,
      wageType: WageType.DAILY,
    },
    {
      code: 'WRK-008',
      name: 'Pappu Lal',
      normalizedName: 'pappu lal',
      mobileNumber: '9866778899',
      trade: 'Plumber',
      verificationStatus: VerificationStatus.AADHAAR_SUBMITTED,
      aadhaarLastFour: '8910',
      siteId: site3.id,
      currentRate: 950.0,
      wageType: WageType.DAILY,
    },
    {
      code: 'WRK-009',
      name: 'Ravi Shankar',
      normalizedName: 'ravi shankar',
      mobileNumber: '9877889900',
      trade: 'Painter',
      verificationStatus: VerificationStatus.VERIFIED,
      aadhaarLastFour: '2109',
      siteId: site3.id,
      currentRate: 850.0,
      wageType: WageType.DAILY,
    },
    {
      code: 'WRK-010',
      name: 'Santosh Paswan',
      normalizedName: 'santosh paswan',
      mobileNumber: '9888990011',
      trade: 'Welder',
      verificationStatus: VerificationStatus.VERIFIED,
      aadhaarLastFour: '5432',
      siteId: null, // Bench / not currently assigned
      currentRate: 1100.0,
      wageType: WageType.DAILY,
    },
    {
      code: 'WRK-011',
      name: 'Deepak Nishad',
      normalizedName: 'deepak nishad',
      mobileNumber: null, // Worker without personal phone
      trade: 'Helper',
      verificationStatus: VerificationStatus.UNVERIFIED,
      aadhaarLastFour: null,
      siteId: site1.id,
      currentRate: 550.0,
      wageType: WageType.DAILY,
    },
    {
      code: 'WRK-012',
      name: 'Gopal Krishna',
      normalizedName: 'gopal krishna',
      mobileNumber: '9899001122',
      trade: 'Excavator Operator',
      verificationStatus: VerificationStatus.VERIFIED,
      aadhaarLastFour: '7654',
      siteId: site2.id,
      currentRate: 1500.0,
      wageType: WageType.DAILY,
    },
  ];

  for (const w of workersData) {
    const worker = await prisma.worker.create({
      data: {
        organizationId: org.id,
        code: w.code,
        name: w.name,
        normalizedName: w.normalizedName,
        mobileNumber: w.mobileNumber,
        trade: w.trade,
        verificationStatus: w.verificationStatus,
        aadhaarLastFour: w.aadhaarLastFour,
        status: WorkerStatus.ACTIVE,
      },
    });

    // If initialRate is defined, create historical rate and current rate
    if (w.initialRate) {
      await prisma.wageRate.create({
        data: {
          workerId: worker.id,
          wageType: w.wageType,
          rate: w.initialRate,
          effectiveFrom: new Date('2025-06-01T00:00:00Z'),
          effectiveTo: new Date('2026-01-01T00:00:00Z'),
          notes: 'Initial joining rate',
          createdByUserId: owner.id,
        },
      });

      await prisma.wageRate.create({
        data: {
          workerId: worker.id,
          wageType: w.wageType,
          rate: w.currentRate,
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: null,
          notes: 'Annual revision based on site skill evaluation',
          createdByUserId: owner.id,
        },
      });
    } else {
      await prisma.wageRate.create({
        data: {
          workerId: worker.id,
          wageType: w.wageType,
          rate: w.currentRate,
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: null,
          notes: 'Base rate on registration',
          createdByUserId: owner.id,
        },
      });
    }

    // Site assignment
    if (w.siteId) {
      await prisma.workerSiteAssignment.create({
        data: {
          workerId: worker.id,
          siteId: w.siteId,
          startDate: new Date('2026-01-15T00:00:00Z'),
          status: AssignmentStatus.ACTIVE,
          notes: 'Assigned during site kickoff',
        },
      });
    }
  }

  console.log(`Created ${workersData.length} Workers with wage rates and site assignments`);

  // 6. Phase 2 Seed: Realistic Attendance Submissions & Wage Snapshots
  const allWorkers = await prisma.worker.findMany({
    where: { organizationId: org.id },
    include: {
      wageRates: { orderBy: { effectiveFrom: 'desc' } },
    },
  });

  const workerMap = new Map(allWorkers.map((w) => [w.code, w]));

  // --- SUBMISSION 1: APPROVED Attendance for Site 1 (SITE-ML4) on 2026-10-20 ---
  const sub1Date = new Date('2026-10-20T00:00:00.000Z');
  const sub1 = await prisma.attendanceSubmission.create({
    data: {
      organizationId: org.id,
      siteId: site1.id,
      attendanceDate: sub1Date,
      status: SubmissionStatus.APPROVED,
      submittedByUserId: supervisor1.id,
      submittedAt: new Date('2026-10-20T18:00:00.000Z'),
      approvedByUserId: accountant.id,
      approvedAt: new Date('2026-10-20T19:30:00.000Z'),
      version: 2,
    },
  });

  // Attendances for Site 1: WRK-001 (PRESENT), WRK-002 (HALF_DAY), WRK-003 (PRESENT)
  const w1 = workerMap.get('WRK-001')!;
  const w2 = workerMap.get('WRK-002')!;
  const w3 = workerMap.get('WRK-003')!;

  const att1 = await prisma.attendance.create({
    data: {
      organizationId: org.id,
      submissionId: sub1.id,
      workerId: w1.id,
      siteId: site1.id,
      attendanceDate: sub1Date,
      status: AttendanceStatus.PRESENT,
      payableUnits: new Prisma.Decimal('1.00'),
      notes: 'Full shift completed on pier casting',
      version: 1,
    },
  });

  const att2 = await prisma.attendance.create({
    data: {
      organizationId: org.id,
      submissionId: sub1.id,
      workerId: w2.id,
      siteId: site1.id,
      attendanceDate: sub1Date,
      status: AttendanceStatus.HALF_DAY,
      payableUnits: new Prisma.Decimal('0.50'),
      notes: 'Morning shift only',
      version: 1,
    },
  });

  const att3 = await prisma.attendance.create({
    data: {
      organizationId: org.id,
      submissionId: sub1.id,
      workerId: w3.id,
      siteId: site1.id,
      attendanceDate: sub1Date,
      status: AttendanceStatus.PRESENT,
      payableUnits: new Prisma.Decimal('1.00'),
      notes: 'Centering and shuttering',
      version: 1,
    },
  });

  // Wage entries for Sub 1
  await prisma.wageEntry.createMany({
    data: [
      {
        organizationId: org.id,
        attendanceId: att1.id,
        workerId: w1.id,
        siteId: site1.id,
        attendanceDate: sub1Date,
        wageRateId: w1.wageRates[0].id,
        wageType: WageType.DAILY,
        rate: w1.wageRates[0].rate,
        payableUnits: new Prisma.Decimal('1.00'),
        grossWage: w1.wageRates[0].rate,
        status: WageEntryStatus.ACTIVE,
        approvedByUserId: accountant.id,
        approvedAt: new Date('2026-10-20T19:30:00.000Z'),
      },
      {
        organizationId: org.id,
        attendanceId: att2.id,
        workerId: w2.id,
        siteId: site1.id,
        attendanceDate: sub1Date,
        wageRateId: w2.wageRates[0].id,
        wageType: WageType.DAILY,
        rate: w2.wageRates[0].rate,
        payableUnits: new Prisma.Decimal('0.50'),
        grossWage: new Prisma.Decimal(Number(w2.wageRates[0].rate) * 0.5).toDecimalPlaces(2),
        status: WageEntryStatus.ACTIVE,
        approvedByUserId: accountant.id,
        approvedAt: new Date('2026-10-20T19:30:00.000Z'),
      },
      {
        organizationId: org.id,
        attendanceId: att3.id,
        workerId: w3.id,
        siteId: site1.id,
        attendanceDate: sub1Date,
        wageRateId: w3.wageRates[0].id,
        wageType: WageType.DAILY,
        rate: w3.wageRates[0].rate,
        payableUnits: new Prisma.Decimal('1.00'),
        grossWage: w3.wageRates[0].rate,
        status: WageEntryStatus.ACTIVE,
        approvedByUserId: accountant.id,
        approvedAt: new Date('2026-10-20T19:30:00.000Z'),
      },
    ],
  });

  // Pending Correction Request on att2 (WRK-002)
  await prisma.attendanceCorrection.create({
    data: {
      organizationId: org.id,
      attendanceId: att2.id,
      previousStatus: AttendanceStatus.HALF_DAY,
      previousPayableUnits: new Prisma.Decimal('0.50'),
      previousWageAmount: new Prisma.Decimal(Number(w2.wageRates[0].rate) * 0.5).toDecimalPlaces(2),
      newStatus: AttendanceStatus.PRESENT,
      newPayableUnits: new Prisma.Decimal('1.00'),
      newWageAmount: w2.wageRates[0].rate,
      reason: 'Worker actually worked full shift; supervisor mistakenly recorded half day.',
      status: CorrectionStatus.PENDING,
      requestedByUserId: supervisor1.id,
    },
  });

  // --- SUBMISSION 2: APPROVED Attendance for Site 2 (SITE-RPR) on 2026-10-21 ---
  const sub2Date = new Date('2026-10-21T00:00:00.000Z');
  const sub2 = await prisma.attendanceSubmission.create({
    data: {
      organizationId: org.id,
      siteId: site2.id,
      attendanceDate: sub2Date,
      status: SubmissionStatus.APPROVED,
      submittedByUserId: supervisor2.id,
      submittedAt: new Date('2026-10-21T18:15:00.000Z'),
      approvedByUserId: owner.id,
      approvedAt: new Date('2026-10-21T20:00:00.000Z'),
      version: 2,
    },
  });

  const w4 = workerMap.get('WRK-004')!;
  const w5 = workerMap.get('WRK-005')!; // HOURLY
  const w6 = workerMap.get('WRK-006')!;

  const att4 = await prisma.attendance.create({
    data: {
      organizationId: org.id,
      submissionId: sub2.id,
      workerId: w4.id,
      siteId: site2.id,
      attendanceDate: sub2Date,
      status: AttendanceStatus.PRESENT,
      payableUnits: new Prisma.Decimal('1.00'),
      notes: 'Footing reinforcement binding',
      version: 1,
    },
  });

  const att5 = await prisma.attendance.create({
    data: {
      organizationId: org.id,
      submissionId: sub2.id,
      workerId: w5.id,
      siteId: site2.id,
      attendanceDate: sub2Date,
      status: AttendanceStatus.PRESENT,
      hoursWorked: new Prisma.Decimal('8.50'),
      payableUnits: new Prisma.Decimal('8.50'),
      notes: 'Temporary DB wiring & flood light setup',
      version: 1,
    },
  });

  const att6 = await prisma.attendance.create({
    data: {
      organizationId: org.id,
      submissionId: sub2.id,
      workerId: w6.id,
      siteId: site2.id,
      attendanceDate: sub2Date,
      status: AttendanceStatus.ABSENT,
      payableUnits: new Prisma.Decimal('0.00'),
      notes: 'Informed leave',
      version: 1,
    },
  });

  // Wage entries for Sub 2 (Hourly calculation: 140 * 8.5 = 1190.00)
  await prisma.wageEntry.createMany({
    data: [
      {
        organizationId: org.id,
        attendanceId: att4.id,
        workerId: w4.id,
        siteId: site2.id,
        attendanceDate: sub2Date,
        wageRateId: w4.wageRates[0].id,
        wageType: WageType.DAILY,
        rate: w4.wageRates[0].rate,
        payableUnits: new Prisma.Decimal('1.00'),
        grossWage: w4.wageRates[0].rate,
        status: WageEntryStatus.ACTIVE,
        approvedByUserId: owner.id,
        approvedAt: new Date('2026-10-21T20:00:00.000Z'),
      },
      {
        organizationId: org.id,
        attendanceId: att5.id,
        workerId: w5.id,
        siteId: site2.id,
        attendanceDate: sub2Date,
        wageRateId: w5.wageRates[0].id,
        wageType: WageType.HOURLY,
        rate: w5.wageRates[0].rate,
        hoursWorked: new Prisma.Decimal('8.50'),
        payableUnits: new Prisma.Decimal('8.50'),
        grossWage: new Prisma.Decimal('1190.00'),
        status: WageEntryStatus.ACTIVE,
        approvedByUserId: owner.id,
        approvedAt: new Date('2026-10-21T20:00:00.000Z'),
      },
      {
        organizationId: org.id,
        attendanceId: att6.id,
        workerId: w6.id,
        siteId: site2.id,
        attendanceDate: sub2Date,
        wageRateId: w6.wageRates[0].id,
        wageType: WageType.DAILY,
        rate: w6.wageRates[0].rate,
        payableUnits: new Prisma.Decimal('0.00'),
        grossWage: new Prisma.Decimal('0.00'),
        status: WageEntryStatus.ACTIVE,
        approvedByUserId: owner.id,
        approvedAt: new Date('2026-10-21T20:00:00.000Z'),
      },
    ],
  });

  // --- SUBMISSION 3: SUBMITTED (Pending Approval) for Site 1 on 2026-10-24 ---
  const sub3Date = new Date('2026-10-24T00:00:00.000Z');
  const sub3 = await prisma.attendanceSubmission.create({
    data: {
      organizationId: org.id,
      siteId: site1.id,
      attendanceDate: sub3Date,
      status: SubmissionStatus.SUBMITTED,
      submittedByUserId: supervisor1.id,
      submittedAt: new Date('2026-10-24T18:30:00.000Z'),
      version: 1,
    },
  });

  await prisma.attendance.createMany({
    data: [
      {
        organizationId: org.id,
        submissionId: sub3.id,
        workerId: w1.id,
        siteId: site1.id,
        attendanceDate: sub3Date,
        status: AttendanceStatus.PRESENT,
        payableUnits: new Prisma.Decimal('1.00'),
        notes: 'Pier cap shuttering',
        version: 1,
      },
      {
        organizationId: org.id,
        submissionId: sub3.id,
        workerId: w2.id,
        siteId: site1.id,
        attendanceDate: sub3Date,
        status: AttendanceStatus.PRESENT,
        payableUnits: new Prisma.Decimal('1.00'),
        notes: 'Assisting carpenter gang',
        version: 1,
      },
      {
        organizationId: org.id,
        submissionId: sub3.id,
        workerId: w3.id,
        siteId: site1.id,
        attendanceDate: sub3Date,
        status: AttendanceStatus.HALF_DAY,
        payableUnits: new Prisma.Decimal('0.50'),
        notes: 'Worked till 1 PM',
        version: 1,
      },
    ],
  });

  // --- SUBMISSION 4: DRAFT for Site 2 on 2026-10-24 ---
  const sub4 = await prisma.attendanceSubmission.create({
    data: {
      organizationId: org.id,
      siteId: site2.id,
      attendanceDate: sub3Date,
      status: SubmissionStatus.DRAFT,
      version: 1,
    },
  });

  await prisma.attendance.createMany({
    data: [
      {
        organizationId: org.id,
        submissionId: sub4.id,
        workerId: w4.id,
        siteId: site2.id,
        attendanceDate: sub3Date,
        status: AttendanceStatus.PRESENT,
        payableUnits: new Prisma.Decimal('1.00'),
        notes: 'Draft entry',
        version: 1,
      },
      {
        organizationId: org.id,
        submissionId: sub4.id,
        workerId: w5.id,
        siteId: site2.id,
        attendanceDate: sub3Date,
        status: AttendanceStatus.PRESENT,
        hoursWorked: new Prisma.Decimal('7.00'),
        payableUnits: new Prisma.Decimal('7.00'),
        notes: 'Panel termination',
        version: 1,
      },
    ],
  });

  console.log('Created realistic Attendance submissions, records, wage entries, and correction requests');
  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
