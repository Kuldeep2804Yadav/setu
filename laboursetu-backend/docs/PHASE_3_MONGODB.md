# Phase 3 MongoDB deployment and API

The active MongoDB provider is preserved, per the user's explicit decision.
No PostgreSQL migration file has been changed. Prisma 6 MongoDB does not support
Prisma Migrate or Decimal fields. New financial amounts are canonical decimal
strings, calculated in the backend with Decimal and rounded half-up to paise.

## Deployment

1. Back up the existing MongoDB database using the deployment's normal procedure.
2. Ensure MongoDB is a replica set (including Atlas or a single-node local replica
   set). Transactions are required; the application never falls back to partial
   non-transactional writes.
3. Install the backend independently with `pnpm install --frozen-lockfile`.
4. Run `pnpm db:generate`, `pnpm typecheck`, and `pnpm build`.
5. Review `src/modules/payroll/finance.indexes.ts`. Set
   `PHASE3_APPLY_ADDITIVE=true` and run `pnpm db:phase3` against the intended
   MongoDB database. This creates only the Phase 3 collections and indexes and
   is safe to repeat. It does not drop indexes, update documents, or reset data.
6. Deploy the backend before the frontend. Build the frontend independently with
   its normal API URL/proxy configuration. Existing authentication is reused.

Do not run the historical PostgreSQL migrate commands for this MongoDB provider.
Do not use `db push --accept-data-loss`, reset, or seed against existing data.
No production migration is automatically performed at startup or install.

## Financial invariants

- Exact decimal strings cross the API boundary; no financial totals are accepted
  from the frontend. Decimal arithmetic and rounding happen on the backend.
- Per-organization transactional mutex writes serialize financial mutations.
  Attendance corrections and worker/rate/assignment transactions use the same
  mutex, with bounded retries on transaction conflicts.
- A unique organization/attendance source claim reserves work across payrolls,
  independent of source version. Cancelling unfinalized payroll releases claims
  and recoveries. Finalized source claims remain permanently reserved.
- Draft recalculation replaces its own source claims, items and recovery
  reservations atomically, with the previous snapshot retained in audit history.
- Submit, approval and finalization rebuild and compare source snapshots,
  including rates, attendance versions, authorized adjustments and wage policy.
  Changed data requires returning to draft and recalculating.
- Finalized values remain immutable. Later attendance changes are shown in
  details. Owner-authorized supplemental adjustments can reference the original
  finalized payroll; original attendance cannot be paid twice.
- Advance recovery requires confirmed issuance, respects outstanding balance and
  other draft reservations, and is applied only during finalization.
- Payment creation reserves outstanding wages but remains PENDING. Explicit
  manual confirmation creates ledger events and a receipt. It is never bank
  verification. Confirmed and pending payments together cannot exceed net wages.
- Reversals append compensating ledger entries and retain the original receipt.
  Advances with active recovery reservations/applications cannot be reversed.
- Tenant-scoped idempotency keys retain a canonical payload hash, actor, operation
  and result. Matching retries return the same result; changed payloads fail.
- Every cash/UPI/bank record requires a reference. Reused active references are
  rejected across both advances and wage payments in an organization.
- Completed ledger and audit events have no update/delete API. Database access
  should also be restricted operationally; MongoDB does not provide SQL foreign
  keys or a trigger-based append-only constraint here.

## Wage rules

Wages use approved attendance and historical site assignments. Existing rates
are converted from their stored representation to strings before calculation;
existing monetary Float fields are not rewritten. New exact rates live in
`financial_wage_rates` and take precedence from their effective date onward.
Provide an exact override if a legacy Float cannot be represented as an accepted
decimal string. No existing Float gross-wage total is used for Phase 3 payroll.

Daily wages use one or half a day; hourly wages require actual hours. Weekly and
monthly wages accrue per approved source day using explicit divisors. Monthly
divisors can use actual calendar days or 1–31; weekly divisors use 1–7. Approved
absence for weekly/monthly workers is configurable as paid or unpaid. Missing
days never manufacture payable work. Joining/leaving follows historical site
assignment and archive dates. The existing one-worker-per-day attendance model
is preserved; multiple sites on the same day are not introduced.

Owner-authorized work supplements attach overtime hours/rates or paid leave to
approved attendance. Leave requires enabled policy and approved absence; hourly
leave uses configured hours. Overtime cannot apply to leave/absence. Supplements
cannot alter finalized work. Bonuses, authorized deductions and supplemental
corrections are separate audited adjustments. Statutory deductions are not
automatically applied. Negative net settlements are rejected rather than
silently carried forward; allocate a deduction to a later payable settlement.

## Ledger and reporting

Wage outstanding = WAGE + OVERTIME + BONUS - DEDUCTION - ADVANCE_RECOVERY -
PAYMENT + PAYMENT_REVERSAL. Wage expense excludes recovery, issuance and payments.

Advances outstanding = ADVANCE_ISSUED - ADVANCE_REVERSAL -
ADVANCE_BALANCE_RECOVERY. ADVANCE_RECOVERY reduces wages at work sites;
ADVANCE_BALANCE_RECOVERY reduces the advance at its issuing site. These are two
control balances, not two wage expenses or two payments.

All eight reports share one ledger aggregation for JSON dashboards, PDF and
Excel. Period expense/payment movements follow the selected date range, while
closing balances include all history through the end date. Weekly buckets start
Monday; monthly buckets follow calendar months. Reports are limited to 10,000
ledger rows per selected worker/site to bound memory; narrow filters if exceeded.
Excel values remain strings to preserve exact paise and avoid formula injection.

## Roles

OWNER: all financial actions. ACCOUNTANT: generate/review/recalculate/submit,
manage advances and payments, view/export reports. Approval requires the owner's
explicit organization setting. Finalization, reversals, settings, exact rates,
work supplements and adjustment authorization require OWNER. SUPERVISOR:
financial access denied by default. Services recheck the active database user;
frontend hiding is only a usability measure.

## Endpoints

All paths below are under `/api/v1/finance`, reuse existing session/bearer auth,
CSRF protection and rate limiting, and return `{ success, data, meta? }`.
Every mutation requires an `Idempotency-Key` of 8–120 letters/digits/`_`/`-`.
Amounts are positive strings with at most two fractional places, never numbers.
Dates are valid `YYYY-MM-DD` strings. Actual payment/advance dates cannot be future.

| Method | Path | Input / behavior |
| --- | --- | --- |
| GET / PUT | `/settings` | paidLeave, periodAbsenceRule, monthlyDivisor, weeklyDivisor, paidLeaveHours, accountantCanApprove |
| GET / POST | `/rates` | workerId, type (DAILY/HOURLY/WEEKLY/MONTHLY), amount, effectiveFrom |
| POST | `/work-supplements` | attendanceId, paidLeave, overtimeHours, overtimeRate, reason |
| POST | `/adjustments` | workerId, siteId, date, type BONUS/DEDUCTION, amount, reason, optional correctsPayrollId |
| GET / POST | `/advances` | workerId, siteId, amount, date, method, reference |
| POST | `/advances/:id/confirm` | `{ "manuallyConfirmed": true }` |
| POST | `/advances/:id/reverse` | `{ "reason": "..." }` |
| POST | `/payroll/preview` | name, startDate, endDate, frequency WEEKLY/FORTNIGHTLY/MONTHLY/CUSTOM, optional workerId/siteId, recoveries `[{advanceId,amount}]` |
| GET / POST | `/payroll` | list / save new draft using preview input |
| GET | `/payroll/:id` | frozen items, breakdown, settlement balances, source changes, audit |
| POST | `/payroll/:id/recalculate` | complete replacement period input, DRAFT only |
| POST | `/payroll/:id/submit` | `{}`; DRAFT -> PENDING_APPROVAL |
| POST | `/payroll/:id/approve` | `{}`; PENDING_APPROVAL -> APPROVED |
| POST | `/payroll/:id/finalize` | `{}`; APPROVED -> FINALIZED, owner only |
| POST | `/payroll/:id/return-to-draft` | reason; submitted/approved unfinalized payroll |
| POST | `/payroll/:id/cancel` | reason; unfinalized payroll |
| GET / POST | `/payments` | payrollItemId, amount, date, method, reference |
| POST | `/payments/:id/confirm` | `{ "manuallyConfirmed": true }` |
| POST | `/payments/:id/cancel` | reason; pending records only |
| POST | `/payments/:id/reverse` | reason; confirmed records, owner only |
| GET | `/payments/:id/receipt` | immutable receipt plus current status; optional format=pdf |
| GET | `/ledger` | append-only events |
| GET | `/reports/:kind` | format=json/pdf/xlsx |

Report kinds: daily-cost, weekly-wages, monthly-payroll, worker-statement,
advances, pending-payments, payment-history, site-cost. List filters include
workerId, siteId, status, startDate, endDate, page and limit (max 100), where
applicable. Payroll date filters select overlapping periods. Report generation
uses the complete filtered ledger rather than a page of list data.

Example mutation:

```http
POST /api/v1/finance/payments
Idempotency-Key: unique-payment-request-123
Content-Type: application/json

{"payrollItemId":"<uuid>","amount":"1250.50","date":"2026-11-12","method":"UPI","reference":"external-transaction-reference"}
```

The response remains PENDING until the separate explicit confirmation request.
No UPI PIN, password, bank credential or automated payout is used.

## Tests and visual QA

`pnpm test:unit`, `pnpm test:finance`, frontend `pnpm test`, `pnpm lint`, and
`pnpm build`. Finance integration tests start their own disposable replica set,
validate the generated loopback test URL, and apply the schema only there. They
never use an existing DATABASE_URL. First run downloads a MongoDB test binary.

`pnpm exec tsx scripts/finance-ui-fixture.ts` starts an isolated QA API on 5051
with synthetic records and a temporary test login printed to stdout. Run the
frontend on 3011 with API_SERVER_URL=http://localhost:5051 and
NEXT_PUBLIC_API_URL=/api/v1 for local visual checks. Stop the fixture afterward.
It does not seed, clear, or otherwise connect to the user's configured database.
