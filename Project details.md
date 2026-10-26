# DelCargo HR Platform — architecture

This replaces the original blueprint, which planned Supabase (PostgreSQL) and Vercel. The product was
built on PocketBase and Cloudflare instead; this page describes what is actually running. For setup,
commands and environment variables see `README.md`.

## 1. Overview

One app for three portals — **Employee**, **HR** and **Admin**. A team lead is an employee with the `team_lead` role or flag.
It covers shifts and screen tracking, leave, absences, payroll, tickets, tasks, chat, announcements,
onboarding and careers, on the web and as iOS/Android apps.

## 2. Stack and where it runs

| Layer | Technology | Hosting |
|---|---|---|
| Web app | Next.js 16 (App Router), React 19, Tailwind 4, React Query | Cloudflare Pages, project `hr-web-app`, built from `main` |
| API | Next.js route handlers, edge runtime (`src/app/api/**`) | Same Pages project |
| Database + file storage | PocketBase 0.22 | DigitalOcean droplet in New York behind Caddy, `pb.delcargo.us` — live production data |
| Server hooks | PocketBase JS hooks (`pb_hooks/`): push notifications, stale-shift closing, retention clean-up | Droplet, deployed by `.github/workflows/deploy-pb-hooks.yml` |
| Scheduled jobs | Cloudflare Worker `delcargo-cron` calling `/api/cron/*` | Cloudflare Workers |
| Mobile | Capacitor (static export of the web app) | App Store / Google Play builds from `ios/`, `android/` |
| Desktop tracker | Python app (`tracker-agent/`) | Installed on employees' computers, built by GitHub Actions |
| Chromebook tracker | Chrome extension, Manifest V3 (`chrome-extension/`) | Installed on Chromebooks |
| Email | Resend (password-reset codes) | — |

Decisions that are settled: the database stays on the New York droplet (it is not moved to, or proxied
through, Cloudflare); Cloudflare is used for the Pages app and for cron Workers only.

## 3. How the code is organised

- `src/lib/core/` — plain TypeScript business rules with unit tests: payroll (`payroll`,
  `payrollView`, `payrollCorrections`, `payrollMonthly`), leave-day maths, absences, timesheets,
  tracking settings, screenshot retention. The screens, the API routes and the cron jobs call the same
  functions, so a number is calculated one way everywhere.
- `src/lib/hr/` — data hooks and actions per area (profiles, leaves, payroll, tickets, tracking, …).
- `src/lib/pbAdmin.ts` — server-side PocketBase access with an admin login; API routes use it so the
  browser never needs more than its own session.
- `src/app/(dashboard)/employee|hr|admin/` — the three role portals; `src/components/` — shared UI.
- Sessions are signed tokens checked in `src/lib/serverAuth.ts`; each API route checks the caller's role.

## 4. Roles

| Role | Can |
|---|---|
| Employee | Their own profile, shifts, leave, tickets, tasks, chat, salary page |
| HR | Everything an employee can, plus onboarding, leave review, absences, tracking, payroll review and corrections |
| Admin | Everything HR can, plus paying salaries, settling corrections, and admin-only settings |

Only Admin pays salaries; HR prepares and reviews them.

## 5. Features in brief

- **Shifts and tracking** — employees clock in; Pakistan staff run the desktop agent or the Chrome
  extension (screenshots and heartbeats at the interval HR sets); USA staff use a geofence that only
  measures time. A shift with no heartbeat is closed automatically.
- **Leave** — `pending → hr_approved → approved` (or `rejected`); types PTO, Sick Leave, Urgent, Normal,
  Parental Leave. Only Urgent and Normal leave are deducted, on working days only.
- **Absences** — detected from missing or short shifts (under 4 hours, no clock-in, long inactivity),
  reviewed by HR.
- **Payroll** — see section 6.
- **Tickets, tasks, chat, announcements** — with push notifications; employees choose which categories
  they receive.
- **Careers** — public job list and application form; applications go to HR.
- **Screenshot clean-up** — screenshots are kept for their own month plus until the 10th of the next
  month; a warning goes out on the 7th.

## 6. Payroll rules

- Salary for month M is paid at the start of M+1, by Admin. Pakistan (PKR) and USA (USD) staff are never
  mixed. Bank details come from the employee's profile.
- Deductions: urgent leave (2 days' pay per day), normal leave (1 day), absences (2 days' pay per day),
  partial shifts (proportional shortfall), unfinished onboarding. A month's deductions never exceed its
  base salary.
- New joiners: joined on the 1st–5th → the joining month is held back in full and the next month is
  normal; joined later → the part-month pay is set aside and paid with the salary two months later, and
  the first full month is held back. Held amounts are paid at resignation or termination.
- A month is written down ("frozen") at midnight New York time on the 1st and stays viewable for 10 days.
  A paid month is final: anything found afterwards is recorded as a visible correction that keeps the
  original paid amount; Admin settles the difference separately, and the employee is notified.
- Anniversary raises are automatic (10,000 PKR / 100 USD per year), start the month after the
  anniversary month, and are never back-filled.
- Plan and reasoning: `plans/028-simplify-payroll-tab.md`.

## 7. Data

The collections are defined in the live PocketBase admin; `pb_schema.json` and `pb_schema_recent.json` are partial exports only (collections such as `hr_profiles`, `hr_payroll`, `hr_leaves`,
`hr_timesheets`, `hr_absence_records`, `hr_screenshots`, `hr_notifications`, `hr_tickets`,
`hr_payroll_breakdowns`, `hr_system_state`). Several collections hold a small `data` JSON column keyed
by a unique field. Changes to the live schema are made deliberately through
`/api/admin/schema-migration` actions (dry run first) — never by editing production by hand.

## 8. Known gaps

Open security and quality items from the latest review are kept in the owner's local QA reports (not in git, because they contain security findings and personal data).
