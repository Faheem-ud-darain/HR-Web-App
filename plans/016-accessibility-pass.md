# 016 — Accessibility pass (labels, landmarks, icon-only buttons)

- **Status**: TODO
- **Commit**: (none yet — planning only)
- **Severity**: MEDIUM
- **Category**: Accessibility (not part of the animation audit — tracked here for the same reason plans 007-011 are)
- **Estimated scope**: large in file-count, mechanical per site. Confirmed via grep during the 10-category audit: only 7 `aria-label` uses and 158 `<label>` elements but just 1 using `htmlFor` across 101 `.tsx` files; 123 `title` attributes used as a substitute for `aria-label` on icon-only buttons; landmark elements (`<nav>`/`<main>`/`<header>`/`<aside>`) present in only 8 of 101 files; no skip-to-content link anywhere.

## Problem

The app is close to unusable with a screen reader today, for three
independent reasons found during audit:

1. **Unassociated form labels.** 158 `<label>` elements exist across the
   app but only 1 uses `htmlFor` paired with the input's `id`. A sighted
   user sees the label sitting next to the input and infers the
   connection visually; a screen reader has no such inference — without
   `htmlFor`/`id` pairing (or wrapping the input inside the `<label>`), a
   screen reader user tabbing into a form field hears no label at all.
2. **Icon-only buttons rely on `title`, not `aria-label`.** 123 `title`
   attributes exist (mostly on icon-only action buttons — edit, delete,
   close, force-disconnect, etc. — the exact class of button plan 011
   catalogued as "icon-only, left raw"). `title` is a mouse-hover tooltip,
   not a reliable accessible name: it's not read by all screen readers,
   and it never appears at all on touch devices, so a mobile screen-reader
   user (the app explicitly supports Capacitor mobile builds) gets an
   unlabeled button.
3. **No landmarks, no skip link.** Only 8 of 101 component files use any
   of `<nav>`/`<main>`/`<header>`/`<aside>`. A screen reader user's
   primary way of navigating a complex app like this — jump straight to
   the main content, jump to navigation — doesn't work because there's
   nothing to jump between. There's also no skip-to-content link, so a
   keyboard user must tab through the entire sidebar navigation (Sidebar
   has ~5-6 focusable items) on every single page before reaching content.

## Target

- Every `<label>` that's paired with a real form input uses `htmlFor`
  matching that input's `id` (or wraps the input directly).
- Every icon-only button (identified during plan 011's per-file review —
  that catalogue of icon-only buttons across ~50 files is directly
  reusable here as a starting inventory) has an `aria-label` describing
  its action, in addition to (not instead of) its existing `title` where
  one exists — `title` remains as a nice-to-have hover tooltip for sighted
  mouse users, `aria-label` becomes the actual accessible name.
- The main layout (`src/app/(dashboard)/layout.tsx`) wraps its sidebar in
  `<nav aria-label="Main navigation">`, its content area in `<main>`, and
  gains a visually-hidden skip-to-content link as the very first focusable
  element on the page, pointing at the `<main>` region.

## Repo conventions to follow

- Reuse plan 011's own per-file classification work — every file that
  plan noted as containing "icon-only" buttons is exactly this plan's
  worklist; don't re-derive it from scratch, re-grep to confirm it's still
  accurate (some button shapes will have shifted slightly from plan 011's
  own edits) and extend from there.
- Match this codebase's existing Tailwind visually-hidden pattern if one
  exists (check for an existing `.sr-only` utility in `globals.css` or
  Tailwind's built-in `sr-only` class) for the skip link and any visually-
  hidden label text — do not introduce a new one-off visually-hidden
  approach if the app already has a convention.
- Where an input's `id` would collide across multiple rendered instances
  of the same form (e.g. a table row repeated via `.map()`), generate a
  unique `id` per instance (e.g. templated with the row's own id) rather
  than a static string, to avoid duplicate-`id` accessibility violations.
- Do not change any input's `name`, `onChange`, or validation logic while
  adding `htmlFor`/`id` pairing — this is a markup-only accessibility
  pass, same "no behavior change" discipline plan 011 followed.

## Steps

1. Re-run `grep -rc "aria-label" src --include="*.tsx"` and
   `grep -rn "<label" src --include="*.tsx"` to get a current, accurate
   file-by-file worklist (the counts in Problem are from the audit date
   and may have shifted slightly).
2. Add the skip-to-content link and `<nav>`/`<main>` landmarks to
   `src/app/(dashboard)/layout.tsx` first — this is one file, low risk,
   and immediately gives every dashboard page a usable landmark structure
   with a single change.
3. Sweep `<label>` elements file by file, pairing each with its input via
   `htmlFor`/`id`. Batch by the same risk-ordering principle plan 011
   used — smaller/simpler forms first, the largest multi-step forms
   (onboarding wizard in `layout.tsx`, the profile edit modals) last.
4. Sweep icon-only buttons file by file, adding `aria-label` — reuse plan
   011's file list, batch similarly (small utility components first,
   `TrackingView.tsx`/`TicketsView.tsx`/`TeamChatView.tsx`'s many icon-only
   controls last, since those files have the highest count).
5. After each batch: run `npx tsc --noEmit -p tsconfig.json` and do a
   manual screen-reader spot-check (VoiceOver on Mac, or a browser
   extension like axe DevTools) on at least one changed page per batch.

## Boundaries

- Do NOT change any button's or input's behavior, only its accessible
  name/landmark structure.
- Do NOT remove any existing `title` attribute — add `aria-label`
  alongside it, since `title` still helps sighted mouse users.
- Do NOT attempt all ~101 files in one commit — batch per Steps.
- Do NOT touch color contrast or focus-ring styling as part of this plan
  — this plan's scope is labels/landmarks/accessible names specifically;
  a color-contrast audit (relevant given the dataviz skill's own palette
  contrast notes) is better scoped as its own follow-up plan if needed.

## Verification

- **Mechanical**: `npx tsc --noEmit -p tsconfig.json` clean after every
  batch.
- **Mechanical**: re-run the same greps from Problem after the full pass
  — `aria-label` count should be roughly in line with the icon-only-button
  count found during plan 011's review; `htmlFor` count should be close to
  the total `<label>` count (accounting for any labels intentionally not
  paired with a single input, e.g. a fieldset legend).
- **Manual**: run an automated accessibility checker (axe DevTools browser
  extension, or Lighthouse's Accessibility audit) against 4-5 representative
  pages before and after, and confirm the violation count for
  label/name-related issues drops to near zero.
- **Manual**: tab through the dashboard from a fresh page load and confirm
  the skip-link is the first focusable element and correctly jumps focus
  to the main content region.
- **Done when**: every form input has a programmatically-associated label,
  every icon-only button has an `aria-label`, and every dashboard page has
  `<nav>`/`<main>` landmarks plus a working skip-to-content link.
