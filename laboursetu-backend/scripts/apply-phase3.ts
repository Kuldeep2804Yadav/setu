import "dotenv/config";
import { prisma } from "../src/database/index.js";
import { applyFinanceIndexes } from "../src/modules/payroll/finance.indexes.js";

if (process.env.PHASE3_APPLY_ADDITIVE !== "true")
  throw new Error(
    "Set PHASE3_APPLY_ADDITIVE=true after reviewing docs/PHASE_3_MONGODB.md",
  );
if (!/^mongodb(?:\+srv)?:\/\//.test(process.env.DATABASE_URL ?? ""))
  throw new Error("MongoDB DATABASE_URL required");
async function main() {
  try {
    await applyFinanceIndexes(prisma);
    console.log(
      "Phase 3 additive MongoDB collections and indexes applied. Existing collections unchanged.",
    );
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Phase 3 migration failed",
  );
  process.exitCode = 1;
});
