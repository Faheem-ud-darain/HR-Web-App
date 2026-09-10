# 017 — Production hardening (error boundaries, monitoring, loading states)

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: MEDIUM
- **Category**: Completeness / reliability (not part of the animation audit — tracked here for the same reason plans 007-011 are)
- **Estimated scope**: medium. Confirmed via audit: no `error.tsx`, `not-found.tsx`, `loading.tsx`, or `global-error.tsx` anywhere in `src/app`; no error-tracking/monitoring service integrated; no loading-skeleton pattern used anywhere in the app.

## Problem

Three related gaps that all show up the same way to a real user: something
goes wrong, and the app gives them nothing useful.

1. **No error boundaries or custom error pages.** Next.js's App Router
   supports `error.tsx` (catches render errors in a route segment),
   `global-error.tsx` (catches errors in the root layout itself), and
   `not-found.tsx` (custom 404) — none exist anywhere in this app. An
   unhandled exception anywhere in a page component currently shows
   Next.js's default, unstyled error screen (in dev) or a blank/broken
   page (in production), and a mistyped or stale URL shows the framework's
   default 404 instead of anything branded or navigable back into the app.
2. **No error-tracking/monitoring service.** When something breaks in
   production, there's no visibility for the team beyond a user reporting
   it manually (likely through the very support-ticket system this app
   itself provides) or noticing it in `journalctl` on the PocketBase
   droplet. There's no aggregated view of what's failing, how often, or
   for whom.
3. **No loading-skeleton pattern.** Every data-fetching page either shows
   nothing (a flash of empty/wrong content) or a bare text string while
   `useQuery`/`useState` data is in flight — there's no consistent
   loading-state convention across the app (confirmed absent during the
   audit; not something this session has spot-checked exhaustively, so
   verify per-page during Steps).

## Target

- `src/app/global-error.tsx` and a per-route-group `error.tsx` (at minimum
  under `(dashboard)/error.tsx`) exist, rendering a branded "something went
  wrong" screen with a retry action and (in production) automatically
  reporting the error to the monitoring service from Target #2.
- `src/app/not-found.tsx` exists, rendering a branded 404 with a link back
  to the user's role-appropriate dashboard.
- An error-tracking service (Sentry is the standard choice for
  Next.js — has a maintained Next.js SDK, free tier, Edge-runtime support
  confirmed compatible) is integrated, capturing both client-side render
  errors and server-side API route errors, with source maps configured so
  stack traces are readable.
- A shared, reusable loading-skeleton component exists
  (`src/components/ui/Skeleton.tsx` or similar) and is adopted on at least
  the highest-traffic pages (dashboards, payroll, tracking) as a first
  pass — full adoption everywhere can follow as a fast-follow, this plan
  establishes the pattern and applies it to the pages users see most.

## Repo conventions to follow

- Match the existing visual language (Card/Modal/Button components,
  orange-600 accent, slate neutrals) for the error/404 pages — they should
  look like part of this app, not a generic framework fallback.
- Sentry's Next.js SDK must be configured to respect this app's Edge
  runtime routes (several API routes already declare
  `export const runtime = 'edge'`) — confirm Sentry's Edge support before
  wiring it into those specific routes; verify against the same kind of
  Edge-runtime constraint that already ruled out bcryptjs and
  `jsonwebtoken` in this codebase (see `serverAuth.ts`'s own comments).
- Skeleton components should follow the dataviz skill's mark-spec spirit
  even though this isn't a chart — subtle, no jarring animation, respecting
  `prefers-reduced-motion` the same way `.stagger-item`'s existing
  keyframe does in `globals.css`.
- Do not add a new state-management dependency for loading states — this
  app already uses React Query (`@tanstack/react-query`), whose own
  `isLoading`/`isPending` flags are the correct trigger for showing a
  skeleton; this plan is about having something consistent to *show*
  during that state, not about how loading state is tracked.

## Steps

1. **Error boundaries first** (highest safety value, smallest scope):
   add `global-error.tsx`, `(dashboard)/error.tsx`, and `not-found.tsx`.
   Each should render a simple, on-brand message, a "try again" button
   (for `error.tsx`, via its provided `reset()` function) or a link home
   (for `not-found.tsx`), and log the error (console for now, wired to
   Sentry once Step 2 lands).
2. **Integrate Sentry** (or an agreed equivalent): install
   `@sentry/nextjs`, run its setup wizard or manually configure
   `sentry.client.config.ts`/`sentry.server.config.ts`/
   `sentry.edge.config.ts` per its Next.js docs, verify it captures a
   deliberately-thrown test error from both a client component and an
   Edge API route before considering this step done.
3. **Wire the error boundaries from Step 1 to report to Sentry** now that
   it exists.
4. **Build the shared skeleton component** and adopt it on the highest-
   traffic pages first (HR/Admin/Employee dashboards, Payroll Ledger,
   Screen Tracking) — replace whatever ad hoc "loading…" text or blank
   state each currently shows during `isLoading`.
5. Track remaining pages needing skeleton adoption as a documented
   follow-up list (in this plan's own Implementation note once the first
   pass lands) rather than blocking this plan on 100% adoption.

## Boundaries

- Do NOT change any data-fetching logic (React Query configuration,
  cache keys, refetch behavior) as part of this plan — only what renders
  during the existing loading/error states.
- Do NOT ship Sentry with default settings capturing full request bodies
  or PII by default — this app handles payroll and personal data; review
  Sentry's `beforeSend`/data-scrubbing options and configure them
  deliberately rather than accepting defaults, especially for API routes
  that touch salary or personal information.
- Do NOT attempt full skeleton adoption across every page in this plan —
  Step 4 explicitly scopes to the highest-traffic pages first; broader
  adoption is a tracked fast-follow, not a blocker for this plan's "Done."
- Do NOT let Sentry integration block on 100% Edge-runtime compatibility
  if a specific route turns out incompatible — fall back to plain
  `console.error` logging for that one route and note it, rather than
  stalling the whole plan on one edge case.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` clean.
- **Manual**: deliberately throw an error inside a dashboard page
  component, confirm `(dashboard)/error.tsx` renders instead of a blank/
  broken screen, and confirm it appears in Sentry.
- **Manual**: navigate to a nonexistent route, confirm the branded 404
  renders with a working link back into the app.
- **Manual**: throw a deliberate error inside one Edge-runtime API route,
  confirm it's captured in Sentry (not just swallowed by the route's own
  try/catch).
- **Manual**: load each of the Step 4 pages on a throttled/slow network
  and confirm the skeleton renders during the loading window instead of a
  blank flash or raw "loading…" text.
- **Done when**: every unhandled error and 404 shows a branded, on-brand
  page instead of a framework default, every such error is visible in
  Sentry with a readable stack trace, and the highest-traffic pages show a
  real skeleton instead of nothing during data fetches.
