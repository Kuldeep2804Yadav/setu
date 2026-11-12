import type { PrismaClient } from "@prisma/client";

// Forward-only MongoDB migration. Only Phase 3 collections/indexes are created.
// No drop, rename, document update, SQL migration rewrite, or db reset.
const definitions: Record<string, { fields: string[]; unique?: boolean }[]> = {
  finance_mutexes: [],
  finance_settings: [{ fields: ["organizationId"], unique: true }],
  financial_wage_rates: [
    { fields: ["organizationId", "workerId", "effectiveFrom"], unique: true },
    { fields: ["organizationId", "workerId"] },
  ],
  financial_work_supplements: [
    { fields: ["organizationId", "attendanceId"], unique: true },
  ],
  payroll_periods: [
    { fields: ["organizationId", "startDate", "endDate"] },
    { fields: ["organizationId", "status"] },
  ],
  payroll_items: [
    { fields: ["payrollId", "workerId"], unique: true },
    { fields: ["organizationId", "workerId"] },
  ],
  payroll_source_claims: [
    { fields: ["organizationId", "attendanceId"], unique: true },
    { fields: ["organizationId", "payrollId"] },
  ],
  worker_advances: [{ fields: ["organizationId", "workerId", "date"] }],
  advance_recoveries: [
    { fields: ["organizationId", "advanceId", "payrollId"], unique: true },
    { fields: ["organizationId", "payrollId"] },
  ],
  payroll_adjustments: [{ fields: ["organizationId", "workerId", "date"] }],
  worker_payments: [
    { fields: ["organizationId", "workerId", "date"] },
    { fields: ["organizationId", "payrollItemId", "status"] },
  ],
  ledger_entries: [
    { fields: ["organizationId", "idempotencyKey"], unique: true },
    { fields: ["organizationId", "workerId", "date"] },
    { fields: ["organizationId", "siteId", "date"] },
  ],
  payment_receipts: [
    { fields: ["paymentId"], unique: true },
    { fields: ["organizationId"] },
  ],
  financial_requests: [{ fields: ["organizationId", "key"], unique: true }],
  payroll_audit_logs: [{ fields: ["organizationId", "entityId", "createdAt"] }],
};
export async function applyFinanceIndexes(db: PrismaClient) {
  for (const [collection, indexes] of Object.entries(definitions)) {
    const inventory = await db.$runCommandRaw({
      listCollections: 1,
      filter: { name: collection },
      nameOnly: true,
    });
    const cursor = inventory.cursor as { firstBatch?: unknown[] } | undefined;
    if (!cursor?.firstBatch?.length) {
      const create = await db.$runCommandRaw({ create: collection });
      if (create.ok !== 1) throw new Error(`Could not create ${collection}`);
    }
    if (indexes.length) {
      const result = await db.$runCommandRaw({
        createIndexes: collection,
        indexes: indexes.map((index) => ({
          key: Object.fromEntries(index.fields.map((f) => [f, 1])),
          name: `${collection}_${index.fields.join("_")}_${index.unique ? "key" : "idx"}`,
          ...(index.unique ? { unique: true } : {}),
        })),
      });
      if (result.ok !== 1)
        throw new Error(`Could not create indexes for ${collection}`);
    }
  }
}
