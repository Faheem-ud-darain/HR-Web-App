# 008 — Replace `window.confirm()` with the existing `ConfirmDialog` component

- **Status**: TODO
- **Commit**: 6685ae1
- **Severity**: MEDIUM
- **Category**: Usability / consistency (not part of the animation audit — a usability pass, tracked here for the same reason plan 007 is)
- **Estimated scope**: no new primitive needed — edits to 18 call sites across 12 files, each adding local dialog state following an existing, working precedent. Mechanical.

## Correction (read this first)

This plan originally proposed building a brand-new promise-based
`useConfirm()` primitive from scratch, on the assumption that no styled
confirm dialog existed anywhere in the app. That assumption was wrong —
**`src/components/ui/ConfirmDialog.tsx` already exists** (added in commit
`a0e3498`, "add employee delete + confirm dialogs for offboard/delete") and
is already used correctly in exactly one place: `src/components/ui/
UserProfileModal.tsx`'s offboard/delete-employee flow. It just was never
rolled out to the other 18 places in the app that still call the browser's
native `window.confirm()`. This revision points at that existing component
instead of inventing a new one — do NOT create a second confirm-dialog
primitive.

`ConfirmDialog`'s real prop shape (read the file — 98 lines — before writing
any call site edit):

```tsx
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning'; // no 'destructive' boolean — pick one of these two
  requireTextMatch?: string; // optional "type X to confirm" safety, used by the offboard flow
  loading?: boolean; // disables both buttons — pass true while the confirmed action is in flight
}
```

It is prop-driven (isOpen/onClose/onConfirm), not promise-based — each call
site owns its own `useState` for "is this dialog open" and "what am I about
to do if confirmed", exactly like `UserProfileModal.tsx` already does for its
offboard confirm. That is the pattern to replicate at all 18 sites, not a
new async `confirm()` function.

Note for awareness, not action: `ConfirmDialog` renders its own fixed
overlay/portal rather than being built on the shared `Modal` component, so
it doesn't get `Modal`'s exit animation, reduced-motion handling, or
`pushModal`/`popModal` integration. That's a pre-existing property of the
component as shipped in `a0e3498`, not something this plan introduces or is
scoped to fix — see Boundaries.

## Problem

18 places across the app use `window.confirm()` for destructive or
high-stakes actions instead of the app's own `ConfirmDialog`:

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
| 10 | `src/components/ui/UserProfileModal.tsx` | 395 | Apply a pending increment early, outside the payroll cycle (note: this file already imports/uses `ConfirmDialog` elsewhere for offboard — this specific `window.confirm` at line 395 is a separate, unmigrated call in the same file) |
| 11 | `src/components/ui/TeamDocumentsPanel.tsx` | 108 | Remove a shared team document |
| 12 | `src/components/ui/TicketsView.tsx` | 603 | Close a support ticket |
| 13 | `src/components/ui/TicketsView.tsx` | 617 | Re-open a support ticket |
| 14 | `src/components/ui/AbsenceDetailsView.tsx` | 76 | Delete an absence record |
| 15 | `src/components/ui/AbsenceDetailsView.tsx` | 94 | (multi-line confirm, bulk-delete — read in full) |
| 16 | `src/components/ui/CareersView.tsx` | 110 | Delete a job listing |
| 17 | `src/components/ui/TrackingView.tsx` | 368 | Regenerate tracking token |
| 18 | `src/components/ui/TrackingView.tsx` | 381 | Force-disconnect a tracker |

Line numbers are from commit `6685ae1` — re-verify each with a fresh grep for
`window.confirm` before editing, since files may have shifted since.

Why this matters more here than on an average site: this app also ships as a
native Android/iOS app via Capacitor (`android/`, `ios/` folders at repo
root). A native `confirm()` inside a Capacitor WebView can render
inconsistently with the surrounding UI and reads as a jarring break from the
rest of the product — which already has a styled dialog for exactly this,
just not used consistently.

## Target

Each of the 18 call sites gets its own local confirm state (mirroring
`UserProfileModal.tsx`'s existing offboard-confirm pattern exactly — read
that component's relevant `useState`/`ConfirmDialog` usage first and copy
its shape), e.g. (from `warehouses/page.tsx:84`):

```tsx
// current
const confirmDelete = window.confirm('Are you sure you want to delete this warehouse? Assignments will be updated.');
if (!confirmDelete) return;
// ...deletion logic inline here...

// target
// state near the top of the component:
const [pendingDeleteWarehouseId, setPendingDeleteWarehouseId] = useState<string | null>(null);

// where the button that used to call window.confirm was:
const handleDeleteWarehouseClick = (id: string) => setPendingDeleteWarehouseId(id);

// the actual delete logic, now triggered by ConfirmDialog's onConfirm:
const confirmDeleteWarehouse = async () => {
  if (!pendingDeleteWarehouseId) return;
  // ...same deletion logic that used to run inline after window.confirm...
  setPendingDeleteWarehouseId(null);
};

// rendered once near the rest of this component's modals:
<ConfirmDialog
  isOpen={pendingDeleteWarehouseId !== null}
  onClose={() => setPendingDeleteWarehouseId(null)}
  onConfirm={confirmDeleteWarehouse}
  title="Delete warehouse?"
  message="Assignments will be updated."
  confirmLabel="Delete"
  variant="danger"
/>
```

Exact variable names are illustrative — follow each file's own existing
naming conventions for similar state (e.g. if the file already has a
`selectedX`/`pendingX` naming pattern for other modals, match it).

## Repo conventions to follow

- Reuse `ConfirmDialog` as-is — do not modify its props or internals as part
  of this plan (see Boundaries).
- `variant`: use `'danger'` for anything destructive (delete
  warehouse/team/announcement/document/absence-record/job-listing, force-
  disconnect), `'warning'` for anything non-destructive-but-consequential
  (mark-all-processed, regenerate token/setup-code, apply increment early,
  close/re-open a ticket).
- `requireTextMatch`: only use this for the single highest-stakes action in
  this list if any — check `UserProfileModal.tsx`'s existing offboard usage
  to see whether it sets this, and use the same judgment call for e.g. the
  "force-disconnect every tracker" action (#18), which explicitly means to
  affect a session that "may genuinely still be running" per its own
  existing message text. Most of the 18 do not need this.
- `loading`: pass `true` while the confirmed action's own async call
  (`hrActions.delete...`, etc.) is in flight, same as the button-disable
  pattern already used elsewhere in these files for other async actions
  (e.g. `processingId`/`isDeleting`-style state already present in several
  of these components — match whatever each file already does for "action
  in flight" state rather than inventing new naming).

## Steps

1. Read `src/components/ui/ConfirmDialog.tsx` in full (98 lines).
2. Read `src/components/ui/UserProfileModal.tsx`'s existing offboard-confirm
   usage in full — this is the one correct precedent, copy its shape.
3. Migrate each of the 18 call sites one at a time (read the full
   surrounding function first for the multi-line ones marked above):
   add local state, move the confirmed action into an `onConfirm` handler,
   render `<ConfirmDialog>` near the component's other modals, remove the
   `window.confirm(...)` call and its `if (!confirmed) return;` guard (the
   guard is no longer needed — the action only runs from `onConfirm` now).
4. Preserve the exact same message text at each site — only change the
   delivery mechanism, not the wording (some of these messages are long/
   specific, e.g. #18 — copy verbatim into the `message` prop).

## Boundaries

- Do NOT modify `ConfirmDialog.tsx` itself (props, styling, or its lack of
  `Modal`-based portal/animation) as part of this plan — that's a separate,
  smaller follow-up if ever wanted, not required to fix these 18 sites.
- Do NOT touch `ToastNotification.tsx` — unrelated realtime notification-bell
  feature, not a confirm/toast primitive.
- Do NOT change what any of the 18 actions actually do — only how the user
  is asked to confirm.
- Do NOT introduce a new dependency or a second confirm-dialog component.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` — zero errors.
- **Manual**: trigger each of the 18 actions (as the appropriate role) and
  confirm:
  - `ConfirmDialog` appears, not a native browser popup.
  - Cancel/backdrop-click leaves everything unchanged; Confirm performs the
    exact same action `window.confirm` used to gate.
  - Destructive actions show `variant="danger"` (rose); non-destructive ones
    show `variant="warning"` (amber).
- **Done when**: a repo-wide grep for `window.confirm` returns zero results
  in `src/`.
