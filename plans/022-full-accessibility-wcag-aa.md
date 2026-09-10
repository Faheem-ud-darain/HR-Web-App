# 022 — Extend accessibility to full WCAG 2.1 AA (contrast, motion, keyboard)

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: MEDIUM
- **Category**: Accessibility (extends plan 016)
- **Estimated scope**: medium, sequenced strictly after plan 016.

## Problem

Plan 016 fixes the acute accessibility problems (unassociated labels,
missing accessible names on icon-only buttons, missing landmarks). It
explicitly excludes color contrast auditing from its own scope. For a
product being sold to enterprise buyers — some of whom will have their own
accessibility procurement requirements (government contractors and larger
corporations routinely require WCAG 2.1 AA conformance statements) — a full
conformance pass is the difference between "usable" and "certifiably
compliant."

Known specific risk, already flagged by the `dataviz` skill's own reference
palette notes used in `admin/insights/page.tsx`: three of the categorical
chart colors (magenta, yellow, aqua at their light-mode steps) sit below
3:1 contrast on the light chart surface by design, mitigated only by the
"icon + label" / direct-label pairing rule — this needs to be verified as
actually followed everywhere those colors are used, not just documented as
a rule.

## Target

- Full WCAG 2.1 AA conformance: 4.5:1 contrast for normal text, 3:1 for
  large text and UI component boundaries, verified with an automated tool
  across every page, not spot-checked.
- Keyboard-only operability confirmed for every interactive flow (not just
  "has focus states" — actually completing a full task, e.g. approving a
  leave request or processing payroll, using only a keyboard, no mouse).
- `prefers-reduced-motion` respected everywhere motion exists, not just the
  one `.stagger-item` keyframe already covered in the animation plans
  (001-006) — audit for anything added since.
- A written accessibility conformance statement (VPAT-style) that can
  actually be handed to an enterprise buyer's procurement team.

## Repo conventions to follow

- Do not start this plan before plan 016 lands — labels/landmarks/
  accessible names are the foundation; a contrast pass on top of missing
  labels produces a conformance statement that isn't true.
- Reuse the `dataviz` skill's `scripts/validate_palette.js` validator for
  any chart-related contrast questions rather than re-deriving contrast
  math by hand — it already encodes the correct formulas and thresholds
  this app's charts should be held to.
- Match plan 016's per-batch discipline (small files first, largest/most
  complex last, `tsc` + a real check after each batch) — this is the same
  shape of sweep, just checking a different property.

## Steps

1. Run an automated contrast audit (axe DevTools, Lighthouse, or a
   scripted contrast checker) across every distinct page/component and
   produce a concrete violation list — do not rely on visual impression.
2. Fix contrast violations file by file, batched by the same risk-ordering
   principle as plans 011/016.
3. Do a full keyboard-only pass through the highest-value flows (leave
   approval, payroll processing, task assignment, onboarding) — tab order,
   focus visibility, and the ability to complete the flow without a mouse
   at all, including any drag-and-drop interaction (the Leave Management
   kanban board's drag-to-update is a known native-HTML5-DnD flow with no
   documented keyboard alternative — this needs one).
4. Audit every animation/transition added since the original animation
   plans (001-006) for `prefers-reduced-motion` coverage.
5. Write the conformance statement documenting what was tested, what
   passed, and any known remaining gaps — honesty here matters more than a
   clean-looking document, since an enterprise buyer's own accessibility
   team may independently verify it.

## Boundaries

- Do NOT reduce any chart's color count or redesign the categorical
  palette as part of this plan unless the `dataviz` skill's own validator
  actually fails it — the palette is already validated per that skill's
  method; this plan verifies the *pairing rules* (icon+label mitigation)
  are followed in practice, not that the palette itself is wrong.
- Do NOT add a keyboard alternative to leave-kanban drag-and-drop by
  removing the drag interaction — add an alternative (e.g. a status
  dropdown, which `leaves/page.tsx`'s own description already mentions
  existing "on mobile") as a parallel path, keeping drag-and-drop for
  mouse users.
- Do NOT claim full WCAG AA conformance in the written statement for
  anything not actually verified — list gaps honestly if any remain.

## Verification

- **Mechanical**: automated contrast/accessibility scan (axe/Lighthouse)
  shows zero contrast violations across the audited pages.
- **Manual**: complete each of the four flows listed in Step 3 using only
  a keyboard, no mouse.
- **Manual**: verify `prefers-reduced-motion: reduce` in OS/browser
  settings suppresses every non-essential animation in the app.
- **Done when**: the automated scan is clean, all four core flows are
  keyboard-completable, and a written conformance statement exists
  reflecting real, verified results.
