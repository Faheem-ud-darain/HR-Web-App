# DelCargo HR Platform

Web and mobile portal for DelCargo's HR operations: shifts and screen tracking, leave, absences,
payroll, tickets, tasks, chat, announcements and careers. Three roles share one app: **Employee**,
**HR** and **Admin**.

## How it fits together

| Piece | What it is | Where it lives |
|---|---|---|
| Web app | Next.js 16 (App Router), React 19, Tailwind 4, React Query | `src/` — deployed to Cloudflare Pages (project `hr-web-app`, from `main`) |
| API | Next.js route handlers on the edge runtime, authenticated with a signed session token | `src/app/api/**` |
| Database | PocketBase 0.22 on a DigitalOcean droplet (New York) behind Caddy at `pb.delcargo.us` — **live production data** | partial schema exports in `pb_schema.json` / `pb_schema_recent.json` (the live PocketBase admin is the source of truth); server-side hooks in `pb_hooks/` |
| Scheduled jobs | A small Cloudflare Worker that calls the app's `/api/cron/*` routes | `workers/cron/` |
| Mobile apps | Capacitor shells (static export of the web app) for iOS and Android | `ios/`, `android/`, `capacitor.config.ts` |
| Desktop tracker | Python app that takes screenshots and heartbeats during a shift | `tracker-agent/` |
| Chromebook tracker | Chrome extension (Manifest V3) doing the same on ChromeOS | `chrome-extension/` |

Business rules live in plain, tested modules under `src/lib/core/` (payroll, leave days, absences,
timesheets, tracking settings, screenshot retention). The screens, the API routes and the cron jobs
all use the same functions, so a salary is calculated the same way everywhere.

> **Next.js here is a newer version than most documentation covers.** Before changing framework-level
> code (routing, error/loading files, caching, config), read the matching guide in
> `node_modules/next/dist/docs/`. See `AGENTS.md`.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

Useful commands:

```bash
npm test                     # unit tests (vitest) for src/lib
npx tsc --noEmit -p .        # type check
npm run lint                 # ESLint
npm run build                # production build
npm run build:capacitor      # static export for the mobile apps
npm run cap:ios              # build, sync and open the iOS project
npm run cap:android          # build, sync and open the Android project
```

**Careful: a local run talks to whatever PocketBase `NEXT_PUBLIC_PB_URL` points at, which is the live
production database.** Do not create, edit or delete data while testing unless you mean to.

### Environment variables

Defined in `.env.example` (never commit `.env.local`). The ones the code reads:

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_PB_URL` | PocketBase address (set in `next.config.ts`) |
| `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` | Server-side PocketBase admin login used by the API routes |
| `SESSION_JWT_SECRET` | Signs and verifies session tokens |
| `CRON_SECRET` | Shared secret for `/api/cron/*` (24+ characters; the same value is set on the Worker) |
| `RESEND_API_KEY`, `SMTP_FROM` | Password-reset emails |
| `NEXT_PUBLIC_SITE_URL` | Public address the mobile apps use to reach the API routes |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Calendar / Meet integration |
| `SUPERADMIN_*`, `HR_MASTER_LOGIN_*` | Optional alias logins that map to a real Admin/HR account (see `.env.example`; disabled when unset) |

## Scheduled jobs (`workers/cron`)

| Schedule (UTC) | Calls | Does |
|---|---|---|
| 7th, 11:00 | `/api/cron/screenshot-retention?mode=warn` | Warns HR/Admin what screenshots will be deleted |
| 10th–20th, every 5 min | `…?mode=delete` | Deletes last month's screenshots in small batches |
| 1st (from 05:00) to 3rd, every 10 min | `/api/cron/payroll-monthly` | Freezes last month's payroll, then applies anniversary raises |

Deploy with `cd workers/cron && npx wrangler deploy`. Details and a safe "preview" call are in
`workers/cron/README.md`.

## Payroll in one paragraph

Salary for a month is paid at the start of the next month, by Admin only (HR prepares and reviews).
Pakistan (PKR) and USA (USD) staff are never mixed. Deductions come from leave, absences and short
shifts; USA geofencing only measures time. A month is written down at midnight New York time on the 1st
and stays visible for 10 days; anything found after payment is recorded as a visible correction that
Admin settles separately. Raises are automatic and never back-filled. New joiners: joined 1st–5th →
the joining month is held back, the next is normal; joined later → the part-month pay is paid two
months later and the first full month is held back. Code: `src/lib/core/payroll*.ts`; plan:
`plans/028-simplify-payroll-tab.md`.

## Repository map

```
src/app/            pages ((dashboard)/employee|hr|admin, auth, careers, privacy, support) and API routes
src/components/     shared UI (ui/), layout, payroll
src/lib/core/       pure business rules + their tests
src/lib/hr/         data hooks and actions per area (profiles, leaves, payroll, tickets, …)
src/lib/pbAdmin.ts  server-side PocketBase access
pb_hooks/           PocketBase server hooks (deployed to the droplet by .github/workflows)
workers/cron/       Cloudflare cron Worker
tracker-agent/      desktop tracker (Python)   chrome-extension/   Chromebook tracker
plans/              design and fix plans, numbered in order
```

## Other docs

`AGENTS.md` (working rules), `PRODUCT.md` and `DESIGN.md` (product and visual direction),
`Project details.md` (architecture), `plans/` (decisions), `chrome-extension/README.md` and
`tracker-agent/README.md` (trackers).
