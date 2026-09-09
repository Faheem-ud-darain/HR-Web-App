# 011 — Migrate raw `<button>` elements to the shared `Button` component

- **Status**: DONE
- **Commit**: 68f5c82 (this is the commit that *added* `Button.tsx` — "New Ui Fixes" — it has never been imported anywhere since)
- **Severity**: MEDIUM (consistency/maintainability debt, not a defect — the app looks and works fine today)
- **Category**: Refactor / design-system adoption (not part of the animation audit — tracked here for the same reason plan 007 is)
- **Estimated scope**: touches ~56 files, ~427 individual `<button>` call sites. No behavior change intended anywhere — this is a like-for-like visual/markup swap, file by file. Large in file-count, but mechanical and low-risk per site; do NOT attempt in one PR (see Steps for suggested batching).

## Problem

`src/components/ui/Button.tsx` already exists, is well-built, and says so in
its own top-of-file comment:

> "Every button in this app used to be a hand-typed Tailwind string —
> dozens of near-identical variants... This is the one shared source of
> truth going forward."

It supports 6 variants (`primary`, `secondary`, `danger`, `warning`,
`ghost`, `outline`), 3 sizes (`sm`, `md`, `lg`), a `loading` state (spinner
+ auto-disable), and `fullWidth`. It was added in commit `68f5c82`.

Confirmed via grep: it is imported in **zero** files anywhere in `src`.
Meanwhile there are **427** raw `<button` occurrences across **56** files —
every one of them hand-typing its own Tailwind string, none of them reusing
the shared component that was built specifically to replace this pattern.
This is the same "built then abandoned" pattern as `ConfirmDialog.tsx` (see
plan 008's correction) — a real shared primitive exists, nothing uses it.

Top offenders by raw `<button>` count (grep, `src`):

| File | Count |
|---|---|
| `TrackingView.tsx` | 39 |
| `TicketsView.tsx` | 24 |
| `TeamChatView.tsx` | 24 |
| `(dashboard)/layout.tsx` | 22 |
| `hr/teams/page.tsx` | 22 |
| `AbsenceDetailsView.tsx` | 21 |
| `employee/page.tsx` | 19 |
| `TopNav.tsx` | 18 |
| `UserProfileModal.tsx` | 17 |
| `hr/onboarding/page.tsx` | 17 |
| `employee/profile/page.tsx` | 17 |
| `admin/page.tsx` | 15 |
| `auth/page.tsx` | 13 |
| `admin/reports/page.tsx` | 13 |
| `hr/page.tsx` | 11 |
| `CareersView.tsx` | 10 |
| `hr/payroll/page.tsx` | 9 |
| `hr/leaves/page.tsx` | 9 |
| `hr/reports/page.tsx` | 7 |
| `employee/leaves/page.tsx` | 7 |
| *(+ 36 more files, smaller counts)* | — |

Concrete example of the drift this causes — three buttons in
`hr/payroll/page.tsx` (lines 151-190) that are semantically "primary
action", "secondary/outline action", and "segmented tab toggle", each
hand-typing overlapping-but-not-identical Tailwind:

```tsx
<button
  onClick={...}
  disabled={isSyncing}
  className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold px-3 py-2.5 md:py-1.5 rounded-lg text-xs flex items-center gap-1.5 active:scale-97 transition-colors transition-transform shadow-sm"
>
  <RefreshCw className={...} /> Refresh Ledger
</button>

<button
  onClick={exportPayrollCSV}
  disabled={filteredData.length === 0}
  className="bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 text-slate-700 font-semibold px-3 py-2.5 md:py-1.5 rounded-lg text-xs flex items-center gap-1.5 active:scale-97 transition-colors transition-transform"
>
  <Download className="h-3.5 w-3.5" /> Export CSV
</button>
```

Neither of these matches `Button.tsx`'s own canonical `primary`/`outline`
styles exactly (different radius — `rounded-lg` vs `Button.tsx`'s
`rounded-xl`; different font weight — `font-semibold` vs `font-bold`;
`shadow-sm` present on one, absent on the near-identical other for no
apparent reason). This is exactly the drift `Button.tsx`'s own comment was
written to prevent, and it's still happening because nothing adopted it.

Effect on the product: today, no visible bug — everything renders. The
cost is compounding maintenance debt: a future request like "make all
primary buttons a touch smaller" or "standardize button radius" currently
means hand-editing 400+ individual class strings instead of one component;
new buttons keep getting hand-rolled (copy-paste from a neighboring button)
instead of reached for from `Button.tsx`, so the gap only grows.

## Target

Every `<button>` in `src` that represents one of `Button.tsx`'s existing
variants (primary/secondary/danger/warning/ghost/outline at sm/md/lg) is
replaced with `<Button variant=... size=... ...>`, preserving the exact
`onClick`/`disabled`/children/icon content of the original. Example target
for the two buttons quoted above:

```tsx
<Button
  variant="primary"
  size="sm"
  onClick={...}
  disabled={isSyncing}
  className="shadow-sm"
>
  <RefreshCw className={...} /> Refresh Ledger
</Button>

<Button variant="outline" size="sm" onClick={exportPayrollCSV} disabled={filteredData.length === 0}>
  <Download className="h-3.5 w-3.5" /> Export CSV
</Button>
```

(`Button.tsx` accepts a `className` passthrough that is appended after its
own generated classes, so a one-off addition like `shadow-sm` can ride
along without forking the component.)

Not every raw `<button>` is a fit. Explicitly out of scope for a 1:1 swap
(see Boundaries):
- The segmented-tab-toggle pattern (`hr/payroll/page.tsx` lines 172-190,
  and similar tab-strip patterns elsewhere) — this is a different visual
  role (pill/segment, not a standalone button) that `Button.tsx` was not
  designed for. Leave as-is unless a follow-up plan proposes a dedicated
  `SegmentedControl`/`Tabs` primitive.
- Icon-only close/dismiss buttons that carry no variant styling of their
  own (e.g. `UserProfileModal.tsx:445`'s `p-2 rounded-xl text-slate-500
  hover:bg-slate-100` close button) — these are a distinct "icon button"
  shape `Button.tsx` doesn't model (no icon-only size). Leave these alone
  unless a follow-up plan adds an `iconOnly` variant.
- Any `<button type="submit">` or `<button>` wrapped in unusual layout
  logic (absolute positioning, custom flex-grow, etc.) where swapping in
  `Button`'s own `inline-flex` wrapper could change layout — flag these
  for manual review rather than blind-swapping.

## Repo conventions to follow

- Import: `import { Button } from '@/components/ui/Button';` — same alias
  pattern as `Card`/`Modal`/`Badge` imports already used everywhere.
- Do not change any `onClick` handler logic, disabled condition, or
  children content while swapping — this plan is a markup/style migration
  only, not a behavior change. If a button's existing behavior looks wrong
  while migrating it, note it and leave it for a separate bug-fix plan;
  don't fix-and-migrate in the same edit.
- Map existing ad-hoc classes to the nearest existing `Button.tsx` variant
  by color role, not by guessing a new one:
  - orange/primary-colored solid → `variant="primary"`
  - slate/white bordered or plain slate → `variant="outline"` or
    `variant="secondary"` (outline = has a border, secondary = flat slate
    fill — check the original class string for `border` to decide which)
  - rose/red solid (delete/remove/danger actions) → `variant="danger"`
  - amber/yellow solid (warning-toned actions) → `variant="warning"`
  - transparent/text-only inline links styled as buttons → `variant="ghost"`
- Map existing padding/text-size combinations to the nearest `Button.tsx`
  size (`sm`/`md`/`lg` — see its own `SIZE_STYLES` comment for the exact
  px/text-size breakpoints) rather than inventing a 4th size.
- If a button's existing classes don't cleanly map to any current variant
  or size (e.g. a genuinely unique shape), do not force it — leave it
  as a raw `<button>` and note it in that file's migration notes rather
  than distorting `Button.tsx` or adding a one-off variant no other button
  uses.

## Steps

1. Read `src/components/ui/Button.tsx` in full (done — see Target/Repo
   conventions above for its exact API) before starting any file.
2. Do NOT attempt all 56 files in one pass. Batch by risk and blast radius,
   smallest/safest first, so `tsc` + a manual smoke-test catches problems
   early:
   - Batch 1 (low risk, few call sites, already-familiar pages from this
     session's other plans): `hr/payroll/page.tsx` (9), `admin/payroll/page.tsx`,
     `hr/leaves/page.tsx` (9), `employee/leaves/page.tsx` (7).
   - Batch 2 (medium): `admin/reports/page.tsx` (13), `hr/reports/page.tsx` (7),
     `admin/page.tsx` (15), `hr/page.tsx` (11), `employee/page.tsx` (19).
   - Batch 3 (high-traffic shared components — touch carefully, these
     render on nearly every page): `TopNav.tsx` (18), `(dashboard)/layout.tsx` (22).
   - Batch 4 (largest/most complex — do last, once the pattern is proven
     on batches 1-3): `TrackingView.tsx` (39), `TicketsView.tsx` (24),
     `TeamChatView.tsx` (24), `hr/teams/page.tsx` (22),
     `AbsenceDetailsView.tsx` (21), `UserProfileModal.tsx` (17),
     `hr/onboarding/page.tsx` (17), `employee/profile/page.tsx` (17),
     `auth/page.tsx` (13), `CareersView.tsx` (10).
   - Remaining ~36 smaller files: sweep last, in any order.
3. Per file: read it in full, classify each `<button>` against the
   Target/Boundaries above (swap / skip-tab-toggle / skip-icon-only /
   flag-for-review), swap the ones that fit, leave a one-line comment only
   where a decision isn't obvious from the code alone.
4. After each batch: run `npx tsc --noEmit -p tsconfig.json` and fix any
   type errors before moving to the next batch.
5. After each batch: manually click through the changed pages (or ask for
   a spot-check) to confirm no visual regression — hover/active/disabled
   states in particular, since `Button.tsx`'s `active:scale-97` + 200ms
   transition timing may read slightly differently than a page's original
   hand-tuned transition duration.

## Boundaries

- Do NOT modify `Button.tsx` itself as part of this migration unless a
  batch surfaces a genuinely missing variant/size that recurs 3+ times —
  in that case stop, note the gap, and get it reviewed as a small
  `Button.tsx` change before continuing the batch that needed it.
- Do NOT migrate the segmented-tab-toggle pattern or icon-only dismiss
  buttons (see Target) — those need their own primitive, not a forced fit
  into `Button.tsx`.
- Do NOT change any handler logic, copy, icons, or disabled conditions —
  visual/markup parity only.
- Do NOT do all 56 files in a single commit/PR — batch per Steps, so a
  regression in one batch doesn't block or get tangled with the others.
- Do NOT touch the animation plans in this same `plans/` folder (001-006)
  or plans 007-010 — unrelated, separate work.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` — zero errors, run
  after every batch (not just once at the end).
- **Mechanical**: after all batches, `grep -rn "<button" src --include="*.tsx" | wc -l`
  should be much lower than 427 — the remainder should be exactly the
  documented skips (tab toggles, icon-only dismiss buttons, flagged
  edge cases), not leftovers nobody got to.
- **Manual**: spot-check each batch's changed pages in the browser —
  buttons render with the same color/size/icon/label as before, hover and
  disabled states still look right, no layout shift from the swap to
  `Button`'s `inline-flex` wrapper.
- **Done when**: `Button.tsx` has a non-zero import count across the
  codebase (today: 0), every swapped button is behaviorally identical to
  before, and the only remaining raw `<button>` elements are the
  documented, deliberate skips.

## Implementation note (post-build)

Implemented in full across ~56 files, ~427 original raw `<button>` sites,
in the batches described above plus a final sweep of the remaining smaller
files. `Button.tsx` now has **139** JSX usages across the codebase (from 0).
`npx tsc --noEmit -p tsconfig.json` is clean after every single commit in
this migration — no batch was allowed to leave a type error for the next
one to find. Roughly 295 raw `<button>` occurrences remain in `src` after
the migration; every one of them is a deliberate, documented skip per the
classification rules below, not a leftover.

### Classification heuristic actually used

The plan's own color→variant table was the starting point, but the real
work was drawing a hard line between "migrate" and "leave raw" for every
shape that doesn't map to a fixed Tailwind color. The rules applied
consistently across all 56 files:

- **Color-family match, standalone button → migrate.** Orange solid →
  `primary`; slate/white bordered → `outline`; flat slate fill (no border)
  → `secondary`; rose solid → `danger`; amber solid → `warning`;
  transparent/no-background → `ghost` (rare — most "plain" buttons turned
  out to be text links instead, see below).
- **"Chip" vs "standalone action button."** A small, tinted, inline
  row-action button living inside a table row, card, or list item (e.g. a
  `View`/`Download`/`Reactivate` chip, or a colored status-change button
  next to a record) was always left raw, even when its color matched a
  variant. These read as part of the row's data density, not as a
  page-level action, and forcing them into `Button.tsx`'s fixed padding/
  font-weight/border-radius would visually inflate every table row and
  card across the app. A "standalone action button" — page header,
  modal footer, card-level single action — was migrated when the color
  matched.
- **Plain text links are not buttons**, even when wrapped in a `<button>`
  tag and even when they trigger navigation/state changes. If the original
  classes carried no background and no padding-derived shape (just
  underline or colored text, e.g. `text-orange-600 hover:text-orange-700`
  with no `bg-*`/`px-*`), it was left raw. See the self-caught mistake
  below — this rule was learned mid-session, not started with it.
- **Icon-only buttons** (a single icon child, `p-*`-only sizing, `title`
  instead of visible text) were never migrated — `Button.tsx` has no
  icon-only size/shape, and forcing one in would either add dead
  horizontal padding or require override classes fighting the component.
- **Tab/segment toggles** — any button that is one of a fixed set (2+)
  toggling a view/filter, usually styled with a ternary between an
  "active" and "inactive" class string — were always left raw. These are
  a `SegmentedControl`/`Tabs` shape, explicitly out of scope per the
  plan's own Boundaries.
- **`type="submit"` buttons were always skipped**, per the plan's own
  instruction to flag rather than blind-swap. In practice every single
  one encountered this session was skipped rather than manually reviewed
  further, since none needed layout changes that would justify the risk.
- **"Outline-danger hybrid" buttons** (white/bordered background but rose
  text — e.g. a "Delete Account Permanently" button) were left raw: they
  don't cleanly match either `outline` (wrong text color) or `danger`
  (wrong background), and forcing a choice would change their visual
  weight relative to the other outline/danger buttons on the same page.
- **Responsive icon↔text-shape buttons** (buttons that render as an
  icon-only circle on mobile and an icon+label pill on desktop via
  Tailwind breakpoint classes, seen in `TicketsView.tsx`'s ticket-header
  actions) were left raw — `Button.tsx` has no responsive-shape support,
  and the two breakpoints would need genuinely different variants.
- **Colors with no `Button.tsx` variant** (emerald, sky, indigo, purple,
  amber-as-background-with-white-bg-hybrid) were left raw rather than
  approximated to the nearest existing variant — e.g. emerald "Start/End
  Shift", "Release Monthly Funds", "Approve & Unlock Dashboard"; sky "New
  Notice"; purple "Manage Warehouse Managers"; amber-bordered "Manage
  Team Leads". Approximating these to `primary`/`warning` would have
  changed their actual on-screen color, which the plan's Boundaries
  explicitly forbid (visual parity only).
- **A parameterized/dynamically-colored button already living in a
  shared component** (`ConfirmDialog.tsx`'s confirm button, whose color
  comes from a `colors` object keyed by the caller's `variant` prop) was
  left raw — its whole purpose is to expose a color the fixed `Button.tsx`
  variant set doesn't parameterize the same way, so migrating it would
  have required either hardcoding one color (breaking other callers) or
  threading `Button.tsx`'s variant prop through in a way not attempted
  here.
- **Where a button used a `className` prop to add non-modeled behavior**
  (`active:scale-97`, `transition-transform`, exact custom padding that
  didn't cleanly match a size step, `flex-1`/`order-*`/`shrink-0` layout
  utilities), the migrated `<Button>` kept those via its own `className`
  passthrough rather than dropping them — `Button.tsx` appends `className`
  after its own generated classes, so later-declared Tailwind utilities in
  the passthrough win the cascade for any overlapping property (used with
  `!important` overrides only where an exact padding/font-size needed to
  beat the size step's own class, e.g. `!py-1.5`, `!text-[9px]`).
- **Zero-migration files are a valid, correct outcome** — `admin/payroll/
  page.tsx`, `TopNav.tsx`, `Sidebar.tsx`, `admin/leaves/page.tsx`,
  `employee/tasks/page.tsx`, `DocumentsModal.tsx`, and others were read in
  full and confirmed to contain no clean-fit buttons (all chips, tab
  toggles, icon-only controls, or unmatched colors) — these are documented
  reviews, not skipped work.

### Self-caught mistakes (both fixed before any commit landed in a broken state)

1. **Forced-fit reversal**: in `hr/page.tsx`, the plain text link "Full
   Kanban board →" was initially migrated into `<Button variant="ghost">`
   with `!important` overrides fighting the component's built-in padding
   back to zero. This was exactly the "forced fit" the plan's Boundaries
   warn against, and was reverted to a raw `<button>` before committing —
   this is what established the plain-text-link exclusion rule above.
2. **Recurring stray closing tag**: several `<button>`→`<Button>`
   replacements that targeted a multi-line button whose last child was a
   ternary expression (e.g. `{isLoading ? 'Saving…' : 'Save Changes'}`)
   immediately followed by `</button>` on its own line left that trailing
   tag unconverted, producing a `tsc` `TS17002` mismatched-JSX-tag error.
   Caught in every case by either `tsc` directly or a proactive grep
   before running `tsc`, and fixed with a small targeted follow-up
   replacement converting the specific stray `</button>` to `</Button>`.

### Final numbers

- `Button.tsx` JSX usages: **139** (target was "non-zero" — met).
- Remaining raw `<button>` occurrences: **295**, all documented skips per
  the categories above.
- `npx tsc --noEmit -p tsconfig.json`: clean after every commit in this
  migration, no exceptions.
- No `Button.tsx` changes were needed — every gap encountered (emerald,
  sky, indigo, purple, dynamic-color, responsive-shape, chip, tab-toggle,
  text-link, icon-only) was handled by leaving the button raw rather than
  extending the component, consistent with the plan's Boundaries.
