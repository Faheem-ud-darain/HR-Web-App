# 009 — Unified action feedback (toast) instead of per-page success/error banners

- **Status**: TODO
- **Commit**: 59a9c20
- **Severity**: MEDIUM
- **Category**: Usability / consistency (usability pass, tracked here for the same reason plan 007 is)
- **Estimated scope**: 1 new shared primitive (~60-100 lines) + edits to 12 files that currently roll their own `successMsg`/error banner state.

## Problem

There is exactly one toast-like component in the app today,
`src/components/ui/ToastNotification.tsx`, mounted once in `src/app/layout.tsx`.
**It is not a generic toast system** — it's a specific feature that subscribes
to the `hr_notifications` PocketBase collection in real time and shows
notification-bell-style alerts. It cannot be reused as-is for "tell the user
their save/delete/update just succeeded."

Instead, 12 files each reimplement their own local success/error banner with
`useState` + conditional JSX, with no shared component:

- `src/app/(dashboard)/admin/leaves/page.tsx`
- `src/app/(dashboard)/admin/profile/page.tsx`
- `src/app/(dashboard)/admin/reports/page.tsx`
- `src/app/(dashboard)/hr/leaves/page.tsx`
- `src/app/(dashboard)/hr/profile/page.tsx`
- `src/app/(dashboard)/employee/leaves/page.tsx`
- `src/app/(dashboard)/employee/profile/page.tsx`
- `src/components/ui/ScheduleMeetModal.tsx`
- `src/components/ui/MaintenanceNoticeManager.tsx`
- `src/components/ui/TaskModal.tsx`
- `src/components/ui/TicketsView.tsx`
- `src/components/ui/CareersView.tsx`

Concrete example of the actual usability problem this causes (not just code
duplication): in `admin/reports/page.tsx`, editing an employee's warehouse/
tracking assignment sets `successMsg` (line ~118) which renders in a banner
near the top of the page (line ~348). The employee list this page shows can
be long; the row you just edited (and the button you just clicked) can be far
below that banner, off-screen. The confirmation that your edit worked is
easy to miss because it doesn't appear near where you're looking.

Each of the 12 implementations also has its own ad-hoc show/auto-dismiss
timing (not all of them even auto-dismiss — some just sit there until the
next state change clears them), so behavior is inconsistent from page to page.

## Target

A shared, imperative toast primitive: `useActionToast()` hook + a single
`<ActionToastHost />` mounted once high in the tree (see Steps for exactly
where), rendering small, auto-dismissing, top-or-bottom-anchored (pick one,
consistently — see Repo conventions) toasts near the viewport edge rather
than inline in page content, so they're visible regardless of scroll
position.

Call-site shape (from `admin/reports/page.tsx`'s current
`setSuccessMsg('Successfully updated assignment for ...')`):

```tsx
// current
setSuccessMsg(`Successfully updated assignment for ${displayName(selectedEmp, 'admin')}`);
setTimeout(() => setSuccessMsg(''), /* whatever this file's own timeout is */);

// target
showToast({ type: 'success', message: `Successfully updated assignment for ${displayName(selectedEmp, 'admin')}` });
```

One call, no manual timeout management, no local `successMsg` state at all —
the host owns visibility/auto-dismiss timing.

## Repo conventions to follow

- Naming: call it `ActionToastHost`/`useActionToast` (not `Toast`/`useToast`)
  to keep it unambiguous from `ToastNotification` (the real-time notification
  bell feature) — the two must never be confused by a future reader.
- Visual style: match this app's existing success/error banner colors
  (emerald-50/emerald-700 for success, rose-50/rose-600 for error — see any
  of the 12 files above, they're all already consistent on this) so the new
  toasts look like a natural evolution of what's there, not a new visual
  language.
- Auto-dismiss timing: check what the majority of the 12 existing
  implementations already use (skim each file's `setTimeout(() => set... , N)`
  call) and standardize on whichever duration is most common, rather than
  inventing a new number.
- Positioning: this app already has a mobile floating bottom pill nav
  (`Sidebar.tsx`) and a bottom-anchored composer on Tickets/Chat screens (see
  `(dashboard)/layout.tsx`'s `isTicketsScreen`/`isChatScreen` handling) — a
  bottom-anchored toast risks colliding with both. Anchor toasts top-center
  or top-right instead, clear of those elements.

## Steps

1. Read `src/components/ui/ToastNotification.tsx` in full to confirm exactly
   why it can't be reused directly (it's tied to `hr_notifications`
   real-time data, not arbitrary messages) and to match its visual/motion
   style as a starting point for the new component's look.
2. Create `src/components/ui/ActionToastHost.tsx`: context + state for a
   queue of `{id, type: 'success' | 'error', message}` toasts, a
   `useActionToast()` hook exposing `showToast(...)`, auto-dismiss via
   `setTimeout`, and the toast UI itself (small card, matching Repo
   conventions above).
3. Mount `<ActionToastHost>` once — likely `src/app/layout.tsx` (same level
   as `ToastNotification`) since `CareersView.tsx` (a public, non-dashboard
   page) is one of the 12 files needing this. Confirm the right mount point
   the same way plan 008 needs to for its confirm dialog (they may end up
   sharing one root-level "app chrome" provider wrapper — check if that's
   cleaner than two separate providers, but do not merge the toast queue and
   confirm-dialog state into one component; keep them as separate concerns
   even if mounted from the same place).
4. Migrate each of the 12 files: remove its local `successMsg`/error state
   and the inline banner JSX, replace both with `showToast(...)` calls at
   the same points the old `setSuccessMsg`/error-setting calls happened.
5. Double-check each migrated file's error paths too, not just success —
   several of these components already show inline error text on failure;
   fold those into `showToast({ type: 'error', ... })` as well wherever the
   error message was similarly transient/informational rather than a
   persistent form-validation message that should stay inline near the
   field it's about (use judgment per-site: a "must be 14 days in advance"
   field-level validation error stays inline; a "could not save, try again"
   request-failure message becomes a toast).

## Boundaries

- Do NOT touch `ToastNotification.tsx` or its `hr_notifications` real-time
  subscription — unrelated feature, do not merge it with this work.
- Do NOT change any of the 12 files' actual save/update/delete logic — only
  how success/error feedback is delivered.
- Do NOT remove inline, persistent form-validation error messages (e.g. "End
  date cannot be before start date" in `employee/leaves/page.tsx`) — those
  are field-level guidance meant to stay visible while the user fixes the
  form, not a one-shot toast. Only migrate the transient "your action
  succeeded/failed" messages.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` — zero errors.
- **Manual**: trigger a save/update/delete on each of the 12 pages/modals and
  confirm the toast appears near the top of the viewport (not buried in page
  content), auto-dismisses, and the page no longer has a local `successMsg`
  banner rendering inline.
- **Done when**: a repo-wide grep for `successMsg` in `src/` returns zero
  results, and all 12 files call `showToast` instead.
