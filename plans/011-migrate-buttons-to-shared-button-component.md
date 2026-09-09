# 011 — Migrate raw `<button>` elements to the shared `Button` component

- **Status**: TODO
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
