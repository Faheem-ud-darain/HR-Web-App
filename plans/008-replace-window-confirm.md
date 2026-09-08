# 008 — Replace `window.confirm()` with a real confirmation modal

- **Status**: TODO
- **Commit**: 59a9c20
- **Severity**: MEDIUM
- **Category**: Usability / consistency (not part of the animation audit — a usability pass, tracked here for the same reason plan 007 is)
- **Estimated scope**: 1 new shared primitive (~80-120 lines) + edits to 18 call sites across 12 files. Mechanical once the primitive exists.

## Problem

18 places across the app use the browser's native, unstyled `window.confirm()`
for destructive or high-stakes actions, instead of the app's own `Modal`
component (`src/components/ui/Modal.tsx`), which is used for every other
dialog in the app:

| # | File | Line | Action being confirmed |
| --- | --- | --- | --- |
| 1 | `src/app/(dashboard)/admin/warehouses/page.tsx` | 84 | Delete a warehouse |
| 2 | `src/app/(dashboard)/admin/payroll/page.tsx` | 94 | Mark all pending payroll records processed |
| 3 | `src/app/(dashboard)/admin/page.tsx` | 164 | Delete an announcement |
| 4 | `src/app/(dashboard)/hr/teams/page.tsx` | 115 | Delete a team |
| 5 | `src/app/(dashboard)/hr/teams/page.tsx` | 325 | Delete a warehouse |
| 6 | `src/app/(dashboard)/hr/teams/page.tsx` | 404 | (multi-line confirm — read in full before editing) |
| 7 | `src/app/(dashboard)/hr/page.tsx` | 196 | Delete an announcement |
| 8 | `src/app/(dashboard)/employee/tracker/page.tsx` | 83 | (multi-line confirm — read in full before editing) |
| 9 | `src/app/(dashboard)/employee/tracker/page.tsx` | 122 | Regenerate tracker setup code |
| 10 | `src/components/ui/UserProfileModal.tsx` | 395 | Apply a pending increment early, outside the payroll cycle |
| 11 | `src/components/ui/TeamDocumentsPanel.tsx` | 108 | Remove a shared team document |
| 12 | `src/components/ui/TicketsView.tsx` | 603 | Close a support ticket |
| 13 | `src/components/ui/TicketsView.tsx` | 617 | Re-open a support ticket |
| 14 | `src/components/ui/AbsenceDetailsView.tsx` | 76 | Delete an absence record |
| 15 | `src/components/ui/AbsenceDetailsView.tsx` | 94 | (multi-line confirm, bulk-delete — read in full) |
| 16 | `src/components/ui/CareersView.tsx` | 110 | Delete a job listing |
| 17 | `src/components/ui/TrackingView.tsx` | 368 | Regenerate tracking token |
| 18 | `src/components/ui/TrackingView.tsx` | 381 | Force-disconnect a tracker |

Why this matters more here than on an average site: this app also ships as a
native Android/iOS app via Capacitor (`android/`, `ios/` folders at repo
root). A native `confirm()` inside a Capacitor WebView can render
inconsistently with the surrounding UI (system-styled, not app-styled) and
generally reads as a jarring break from the rest of the product, which uses
`Modal` for absolutely everything else — every other dialog in the app
(edit forms, document viewers, the "leave-protected absence" notice in
`AbsenceDetailsView.tsx` itself) is a styled `Modal`, so these 18 confirms are
the one remaining inconsistency.

## Target

A shared, promise-based `useConfirm()` hook + a single `<ConfirmDialogHost />`
mounted once (in `(dashboard)/layout.tsx`, alongside where `AbsentPopup`,
`AnnouncementPopup` etc. are already mounted once for the whole dashboard).

Call-site shape stays almost identical to today, e.g. (from `warehouses/page.tsx:84`):

```tsx
// current
const confirmDelete = window.confirm('Are you sure you want to delete this warehouse? Assignments will be updated.');
if (!confirmDelete) return;

// target
const confirmDelete = await confirm({
  title: 'Delete warehouse?',
  message: 'Assignments will be updated.',
  confirmLabel: 'Delete',
  destructive: true,
});
if (!confirmDelete) return;
```

The enclosing function must be (or already is) `async` — check each call site;
most of these handlers already `await` other calls (`hrActions.delete...`) so
are already async.

## Repo conventions to follow

- Build the dialog itself ON TOP OF the existing `Modal` component
  (`src/components/ui/Modal.tsx`) — reuse its portal/exit-animation/
  reduced-motion handling, don't reimplement any of that. `Modal` already
  calls `pushModal`/`popModal` (`src/lib/modalStack.ts`) for the
  fixed-position containing-block fix described in `(dashboard)/layout.tsx`'s
  `PageTransition` comment — the confirm dialog must do the same (it will,
  automatically, by being built on `Modal`).
- Promise-based confirm pattern: expose a React context + hook
  (`ConfirmProvider` / `useConfirm()`), where `confirm()` returns a `Promise<boolean>`
  resolved by the dialog's Confirm/Cancel buttons. This is the standard fix
  for "convert a synchronous browser API to an app-styled async equivalent"
  and keeps every call site's diff to "wrap the message in an object, add
  `await`" rather than a bigger restructure.
- Destructive styling: use this app's existing rose/red destructive-action
  color language (see `AbsenceDetailsView.tsx`'s delete buttons — rose-600/
  rose-700 — for the exact classes already used for "this deletes something"
  actions) for `destructive: true` confirms; use the existing orange primary
  color for non-destructive ones (e.g. #2's "mark all processed").
- Haptics: `Modal`/buttons elsewhere use `triggerHaptic` (`src/lib/haptics.ts`)
  on confirm-style actions in a few places — check whether the Confirm
  button should call it too, matching whatever the nearest existing
  destructive-button precedent does (e.g. `AbsenceDetailsView.tsx`'s delete
  flow) rather than inventing new haptic usage.

## Steps

1. Read `src/components/ui/Modal.tsx` in full, and `src/lib/modalStack.ts`,
   to understand the exact mount/exit/portal contract to build on.
2. Create `src/components/ui/ConfirmDialog.tsx`: a `ConfirmProvider` (context
   + state for the current pending confirm request: message/title/labels/
   destructive flag + its resolve function), a `useConfirm()` hook returning
   the `confirm(options)` function, and the dialog UI itself built from
   `Modal`.
3. Mount `<ConfirmProvider>` once, high enough to cover every page that needs
   it — check whether it needs to wrap the whole app (`src/app/layout.tsx`,
   alongside `ToastNotification`) or just the dashboard
   (`(dashboard)/layout.tsx`) — `CareersView.tsx`'s confirm (site #16) is
   the public careers page, NOT under `(dashboard)`, so this likely needs to
   wrap at the root `src/app/layout.tsx` level, not just the dashboard
   layout. Confirm this before picking the mount point.
4. Migrate each of the 18 call sites one at a time (read the full surrounding
   function first for the multi-line ones marked above), replacing
   `window.confirm(...)` with `await confirm({...})` and making the enclosing
   function `async` if it isn't already.
5. Delete no functionality — every migrated call site must keep exactly the
   same "what happens on confirm / what happens on cancel" behavior as today,
   just via the new dialog instead of the browser's.

## Boundaries

- Do NOT touch `ToastNotification.tsx` — that's an unrelated realtime
  notification-bell feature (subscribes to `hr_notifications`), not a
  generic toast/confirm primitive, despite the similar-sounding name. Do not
  merge these two systems.
- Do NOT change what any of the 18 actions actually do — this plan only
  changes how the user is asked to confirm, not the underlying delete/update
  logic.
- Do NOT introduce a new dependency (no react-confirm-alert, no sweetalert,
  etc.) — build on the existing `Modal`.
- If a call site's confirm message construction is more complex than a
  straight string (e.g. site #18's long dynamic message), preserve the exact
  wording — only change the delivery mechanism.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` — zero errors.
- **Manual**: trigger each of the 18 actions (as the appropriate role) and
  confirm:
  - The app's own styled dialog appears, not a native browser popup.
  - Cancel leaves everything unchanged; Confirm performs the exact same
    action that `window.confirm` used to gate.
  - Destructive actions (delete warehouse/team/announcement/document/ticket-
    close/absence-record/job-listing) are visually distinguished (rose/red)
    from non-destructive ones (mark-processed, regenerate token).
- **Done when**: a repo-wide grep for `window.confirm` returns zero results
  in `src/`.
