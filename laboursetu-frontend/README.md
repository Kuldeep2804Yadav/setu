# LabourSetu frontend

Independent copy of the existing Phase 1/2 Next.js App Router application.
Requires Node 20+ and pnpm 9.15.4 (install pnpm or use Corepack).

## Local development

1. Copy .env.example to .env.local.
2. Set NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1.
3. Run pnpm install --frozen-lockfile, then pnpm dev.
4. Run the backend separately on port 5000 with FRONTEND_URL=http://localhost:3000.

Verification: pnpm typecheck, pnpm lint, pnpm test, pnpm build.
Production server: pnpm start (port 3000 by default).

Existing pages: login/register/password recovery; dashboard; organizations/settings;
team/supervisors; sites; workers and wage history; attendance submissions, approvals,
corrections; wage register and CSV export. UI and routes are retained.
The UI uses the original local components rather than introducing a new UI library.

## Deployment

Deploy this directory as the project root on a Next.js host such as Vercel.
Install: pnpm install --frozen-lockfile. Build: pnpm build. Start: pnpm start.
Set NEXT_PUBLIC_API_URL before building: Next embeds it in the client bundle.
For direct requests set the full HTTPS backend API URL, and allow this frontend's
exact origin on the backend. For a same-origin proxy, set NEXT_PUBLIC_API_URL=/api/v1
and API_SERVER_URL=https://api.example.com/api/v1. API_SERVER_URL is server-only.
Cookies are sent with credentials; token storage has not moved to localStorage.
Never set database URLs or session secrets as NEXT_PUBLIC_ variables.
Use HTTPS in production. See [contract maintenance](CONTRACTS.md).

## Git publishing

This directory has its own Git repository, with no remote or initial commit.
Review git status and check for secrets before git add / git commit.
Connect your own empty GitHub repository with:

    git remote add origin <frontend-repository-url>
    git branch -M main
    git push -u origin main

Publishing and deployment are manual. The parent snapshot is not required to build
or run this project. The single-project pnpm-workspace.yaml is an isolation boundary
when this checkout is stored inside the old monorepo; it contains no shared packages.
