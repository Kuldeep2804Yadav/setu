# Phase 3 implementation status

Status: **PARTIAL — database provider decision required.**

## Implemented and verified

- Isolated backend Decimal wage calculation engine for daily, hourly, weekly and
  monthly attendance-based accrual, historical rates, site source allocation,
  configured paid leave, explicit overtime and deterministic half-up rounding.
- Calculation helpers for authorized non-statutory adjustments, partial advance
  recovery validation, and payment balance/status calculation.
- Validation for duplicate work, missing/ambiguous rates, invalid dates and
  decimals, unapproved work, excess recovery and negative net pay.
- 27 focused calculation tests. These are calculation tests, not evidence of
  transactional recovery, financial authorization or payroll integration.

## Changed files

- `src/modules/payroll/calculation.ts`
- `tests/unit/payroll-calculation.test.ts`
- `docs/PHASE_3_DESIGN.md`
- `PHASE_3_COMPLETION_REPORT.md`

## Migration status

No migration created or applied. Existing migration history and active schema
are unchanged. No database connection, reset, seeding or data alteration was
performed. Active schema uses MongoDB/Float. Preserved PostgreSQL schema,
migration lock, SQL migrations and README describe PostgreSQL/Decimal instead.
The provider decision was requested from the user and is pending.

## Verification

- Installed existing backend lockfile dependencies with npm ci --ignore-scripts.
- Prisma client generation against the active schema: passed.
- Backend `npm run typecheck`: passed.
- Backend `npm run test:unit`: **35/35 passed** (27 new, 8 existing).
- Integration/security database tests, migration application, frontend build and
  end-to-end tests: not run. No disposable database was provisioned or changed.

## Remaining limitations

This is not a deployable Phase 3 module. Financial persistence, locking,
idempotency storage, payroll transitions and snapshots, ledger, advance and
payment workflows, RBAC integration, reporting/exports, receipts, frontend pages,
API documentation and environment updates remain to be implemented after the
provider decision. Current helper inputs are internal server contracts and are
not exposed through any new endpoint. Existing Phase 1/2 code is unchanged.

Weekly/monthly calculations currently provide attendance-based divisor
proration only; further absence/payment-period rules need persisted policy
design. Helpers do not enforce tenant permissions or prevent concurrent writes;
those are required at the transactional repository/service layer before use.
