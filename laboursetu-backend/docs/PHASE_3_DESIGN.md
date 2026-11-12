# Phase 3 financial design — pending database decision

## Observed repository state

The active `prisma/schema.prisma` uses MongoDB, UUID string `_id` fields,
and Float monetary columns. `schema.prisma.postgres.bak` uses PostgreSQL,
UUID columns and Decimal monetary columns. Existing migration history and
`migration_lock.toml` target PostgreSQL. README and environment examples also
target PostgreSQL. No database connection or migration has been attempted.

Changing the active provider could break the current deployment. The provider
must be confirmed before adding persistence or integrating financial routes.
The calculation module is deliberately isolated from the database and routes.

## Implemented calculation contract

`src/modules/payroll/calculation.ts` accepts server-selected approved attendance
and historical rate intervals. Inputs and outputs use decimal strings. All money
arithmetic uses Prisma's Decimal implementation; JavaScript Number is only used
for calendar and version metadata. Dates are strict UTC date-only values.

Round base and overtime independently for each source work record to two decimal
places using ROUND_HALF_UP. Sum the rounded components. Bonuses, deductions,
recoveries and payment amounts must already be exact paise. Inputs permit up to
six decimal places and have explicit magnitude limits.

Historical rate intervals are inclusive-start/exclusive-end. Missing or
overlapping intervals fail closed. Weekly wages accrue against an explicit
divisor. Monthly wages use either actual calendar month days or an explicit
divisor. Only approved payable source days accrue period wages; missing and
absent days accrue zero. These policies are explicit calculator inputs, not yet
persisted settings. Alternative absence rules require additional implementation.

Paid leave requires configuration, and hourly leave requires configured hours.
Overtime requires explicit authorized rates and cannot apply to absence/leave.
Daily half-days earn half a day. Hourly half-day status requires actual hours
instead. Each component retains source version, historical rate and site.
The existing Phase 2 one-worker-per-day constraint is respected.

Adjustment authorization is a calculation precondition. Actual authorization
must be checked against persisted server-side records during integration.
Statutory adjustments are rejected until applicable rules are validated.
Recovery validation alone does not provide concurrency or duplicate protection.

## Persistence invariants required before production use

- Every financial entity carries organization ID. Use tenant-qualified composite
  keys and foreign keys for worker, site, payroll item and advance references.
- Payroll periods follow DRAFT -> PENDING_APPROVAL -> APPROVED -> FINALIZED.
  Cancellation releases draft reservations only. Finalized events are immutable.
- Source claims must uniquely identify organization and attendance ID, regardless
  of attendance version. Corrections cannot make the same work payable twice.
- Snapshot the source version, selected wage rate, policy and component values.
  Revalidate source versions during finalization. Post-finalization corrections
  require an independently authorized difference adjustment, never mutation.
- Use database transactions and worker/tenant scoped locking for calculation,
  finalization, recovery allocation, payment confirmation and reversals. Recheck
  all limits after acquiring locks. Serializable conflicts need bounded retries.
- Pending advance requests do not issue ledger entries or allow recoveries.
  Confirmed advances retain creator, approver, confirmation date and reference.
  Reversal must fail when unreversed recoveries remain.
- Advance allocation reservations cannot exceed confirmed outstanding balance
  across draft or submitted payrolls. Recalculation releases old reservations
  atomically. Finalization converts reservations to append-only recoveries.
- Payments reference finalized payroll items. Manual confirmation is explicit
  and must never be labelled bank verified. Payment approval and payroll approval
  are separate concepts. Reversal appends an opposite ledger entry and receipt
  history, with a mandatory reason and owner authorization.
- Tenant-scoped idempotency keys must retain a canonical payload hash and result.
  Reusing a key with another payload fails; matching retries return the original
  result. Payment references need additional duplicate safeguards.
- Ledger entries are append-only. Separate wage obligation, bonus, deduction,
  advance issuance, recovery, payment and compensating reversal types. Define
  worker payable as obligations + bonuses - deductions - recoveries - payments
  plus their compensating reversals. Advances outstanding are issuance minus
  recoveries minus issuance reversals, independent of wage expense.
- Allocate wage expenses by source site once. Preserve explicit allocation for
  adjustments and payment/recovery applications so site balances reconcile.
- Owner has full access. Accountant generates and records financial events;
  approval requires explicit persisted permission. Supervisor financial access
  is denied unless explicitly permitted and restricted to assigned sites.
- Reports and dashboards must use one shared tenant-scoped aggregation layer.
  Excel/PDF exports must reconcile to the same source and ledger totals.

## Remaining implementation sequence

After database confirmation: design final Prisma relationships and additive
migration, validate it against a disposable database, then implement the source
repository, transactions, advances, payroll lifecycle, ledger, payments, receipts,
reports and frontend pages. Add integration and end-to-end coverage, including
concurrent submissions and security checks. Preserve both repositories and all
existing migration files. No database reset, seeding, direct payouts, WhatsApp,
or subscription billing belongs in this implementation.
