# LabourSetu backend

Independent Express/TypeScript API with the original Prisma PostgreSQL layer and
Phase 1/2 business services. Requires Node 20+, pnpm 9.15.4 and PostgreSQL.

## Local development

Copy .env.example to .env. Set DATABASE_URL privately to the EXISTING database;
do not create a replacement or change its schema. Set a random SESSION_SECRET.
Set FRONTEND_URL to the frontend origin (http://localhost:3000 in development).
Run pnpm install --frozen-lockfile, pnpm db:generate, pnpm dev.
Prisma generation does not connect to or modify the database.
Health check: GET /health. Existing APIs remain under /api/v1.

Build/check: pnpm typecheck, pnpm build, pnpm test:unit.
Production start: pnpm start. Build output is dist/server.js.
The original src/modules, middleware, services and utils are retained; database
access is local src/database, and validation/DTOs/constants are local src/shared.

## Database preservation

prisma/schema.prisma and the complete migrations directory were copied unchanged.
To inspect the existing connection without writing data, run pnpm db:status.
Before deployment take and verify a backup, review pending migrations and the
_prisma_migrations table, then run pnpm db:migrate (prisma migrate deploy) only
when the pending migrations are expected. Already-applied migrations are retained.
Do not reset, force-push a schema, or seed the existing database. For a database
created outside Prisma, resolve its migration baseline only after an operator
compares the actual schema; this migration does not mark migrations applied.

The original seed is preserved but DELETES existing records. pnpm db:seed requires
ALLOW_DESTRUCTIVE_SEED=true and refuses NODE_ENV=production. Use only with a
throwaway demo database; seed is never an install/build/start step.

## Tests

pnpm test:unit runs database-free security/health/validation/wage checks.
pnpm test and pnpm test:integration run the existing integration suites, including
auth, roles, tenant isolation, sites, workers, attendance workflows/corrections,
wages, CSV exports, outbox, distributed rate limiting and cleanup.

Create a disposable PostgreSQL database named laboursetu_test. Configure
TEST_DATABASE_URL and ALLOW_TEST_DATABASE_CLEANUP=true in your local environment.
It must target a different database from DATABASE_URL and contain a separate
_test name segment. Never supply production credentials. Then:

    pnpm db:test:migrate
    pnpm test

The test migration helper only targets the validated test URL; tests clear ALL
records in that database. The integration runner refuses to run without explicit
configuration. No database credentials are committed.

## Deployment, CORS and sessions

Deploy this directory as the Node service root. Install with
pnpm install --frozen-lockfile, build with pnpm build, start with pnpm start.
Keep Prisma CLI available for the release migration command. Set PORT,
NODE_ENV=production, DATABASE_URL, SESSION_SECRET (32+ random characters), and
FRONTEND_URL=https://app.example.com. The existing session secret must remain
unchanged during cutover if your environment relies on it.

CORS_ORIGINS optionally accepts comma-separated approved frontend origins and
supersedes FRONTEND_URL; legacy CORS_ORIGIN remains supported. No wildcard origins.
Cookies remain HTTP-only. Secure is enabled in production. COOKIE_SAME_SITE=lax
is appropriate for app.example.com and api.example.com over HTTPS, or the Next
same-origin proxy. For truly different sites set COOKIE_SAME_SITE=none (always
Secure); browser third-party cookie policies may require the frontend proxy.
Host-only API cookies are recommended. COOKIE_DOMAIN is optional for explicitly
trusted shared domains; cookie clearing uses the same domain/path/security values.
If switching to a proxy, leave COOKIE_DOMAIN unset. Mutation origin validation
and existing custom-header/JSON CSRF checks are retained. Non-browser API clients
without Origin keep the existing bearer/cookie support.

The application writes operational logs to stdout/stderr; collect them through
your hosting platform. Health is liveness only and does not assert DB readiness.
The inherited email outbox dispatcher simulates delivery; configure a real mail
provider/worker before relying on production password recovery. Review production
logging of reset tokens before rollout (an existing limitation, not changed here).

## Git publishing

A standalone Git repository is initialized with no remote and no initial commit.
Review files and secrets before committing, then configure your empty remote:

    git remote add origin <backend-repository-url>
    git branch -M main
    git push -u origin main

No push or deployment was performed. No parent source, workspace package or
node_modules is required. The single-project pnpm-workspace.yaml only establishes
an independent package-manager boundary when nested inside the old checkout.
