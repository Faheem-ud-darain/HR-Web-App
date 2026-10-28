---
name: DelCargo HR Design System
description: Visual guidelines for the DelCargo HR Operations System
colors:
  primary: "#ea580c"
  neutral-bg: "#f8fafc"
  neutral-fg: "#0f172a"
  surface: "#ffffff"
  border: "#e2e8f0"
  accent: "#4f46e5"
typography:
  display:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "12px"
  lg: "16px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "24px"
---

# Design System: DelCargo HR

## 1. Overview

**Creative North Star: "The Blueprint Canvas"**

The DelCargo HR visual system is built on grid precision, structural alignment, and pristine visual hierarchy. Designed for internal operations, the system prioritizes clean, flat, and spacious layouts over unnecessary decoration. It evokes the feeling of a clean workspace or a technical blueprint: precise, clear, and highly focused.

This system explicitly rejects "vibe-coded" SaaS tropes, cluttered UI structures, overly rounded shapes (>16px on functional cards), and text overlapping. Spacing is rhythmic and consistent to minimize cognitive load on active users.

**Key Characteristics:**
- Strict alignment to a vertical layout rhythm.
- Restrained color application, using active accents for focus only.
- Clear typographic separation of details.

## 2. Colors

Colors in DelCargo HR serve a functional utility, indicating focus and roles without distracting the user.

### Primary
- **DelCargo Orange** (#ea580c): Used for primary call-to-actions, active navigation highlights, and core interactive states.

### Secondary
- **Indigo Accent** (#4f46e5): Used for secondary buttons and accent items.

### Neutral
- **Deep Slate** (#0f172a): Used for high-contrast primary text.
- **Cool Gray** (#f8fafc): The main dashboard canvas background.
- **Pure White** (#ffffff): Used for structural cards and panels.
- **Muted Slate** (#e2e8f0): Used for fine lines, borders, and input boundaries.

### Named Rules
**The 10% Accent Rule.** The primary orange accent is restricted to less than 10% of any single viewport. Its scarcity ensures that interactive highlights are immediately recognizable.

## 3. Typography

**Display Font:** Xmind (headings, page titles, stat numbers; `font-display`, applied to `h1`–`h3` automatically)
**Body Font:** Questrial (everything else; it has one regular weight, so bold text in the body face is thickened by the browser)
**Mono:** the system monospace stack

Both are set in `src/app/layout.tsx`; Xmind is bundled in `src/app/fonts` because it is newer than Next.js's built-in Google font list.

**Character:** A clean grotesque headline face over a light geometric body face, for legible, dense information layouts.

### Hierarchy
- **Display** (Bold (700), clamp(2rem, 5vw, 3rem), 1.2): Used for primary hero headers and dashboard main titles.
- **Headline** (Semibold (600), 1.5rem, 1.3): Used for section titles and card headings.
- **Title** (Medium (500), 1.125rem, 1.4): Used for subheadings and card details.
- **Body** (Regular (400), 0.875rem, 1.5): Used for standard data labels, form copy, and text tables. Line length is capped at 75ch.
- **Label** (Medium (500), 0.75rem, normal): Used for badges, utility tags, and uppercase headers.

### Type and icon scale (use only these)
Sizes are Tailwind steps; never write an arbitrary `text-[Npx]`.
- **Caption** `text-caption` (11px): badges, timestamps, hints. The smallest text in the app.
- **Label** `text-xs` (12px) · **Body** `text-sm` (14px) · **Title** `text-base` (16px) · then `text-lg`, `text-xl`, `text-2xl`, `text-3xl` for headings and numbers.
- **Icons** (Phosphor): `h-3.5` (14px) beside caption or label text · `h-4` (16px) in buttons and rows · `h-5` (20px) in tiles and nav · `h-6` (24px) for icon buttons and headings · `h-8`, `h-10`, `h-12` only for empty states. Not 12px, 18px or 28px.
- **Icon weight:** outline by default; **fill** for the current page, the selected tab and card tiles; **duotone** for decorative icons (empty states, notice popups, information rows).

## 4. Elevation

The system is flat-by-default to ensure a professional, clean canvas. Depth is conveyed primarily through structural borders (#e2e8f0) and subtle background tints, rather than heavy, distracting drop shadows.

### Shadow Vocabulary
- **Tactile Hover** (box-shadow: 0 4px 12px rgba(0,0,0,0.05)): Used exclusively when hovering cards or interactive buttons to signal tactile response.

### Named Rules
**The Flat-Rest Rule.** All cards, inputs, and container components sit perfectly flat at rest. Drop shadows only appear as a micro-interaction in response to user hovering or focusing.

## 5. Components

### Buttons
- **Shape:** Softly curved corners (6px radius).
- **Primary:** DelCargo Orange background with pure white text. Padding is semantic (8px top/bottom, 16px left/right).
- **Hover / Focus:** Transitions are snappy (150ms ease-out). On hover, background deepens slightly.
- **Active State:** Tactile scale down to scale(0.97) on press.

### Cards / Containers
- **Corner Style:** Medium curves (12px radius).
- **Background:** Pure White (#ffffff).
- **Border:** 1px solid Cool Gray border (#e2e8f0) at rest.
- **Internal Padding:** Large grid spacing (24px).

### Inputs / Fields
- **Style:** 1px Slate border, Pure White background, 8px radius.
- **Focus:** Sharp 2px DelCargo Orange border transition.

### Navigation
- **Sidebar:** Clean white background, thin slate right border. Navigation links hover state uses a subtle cool gray tint, while active uses a soft orange tint with bold text.

## 6. Do's and Don'ts

### Do:
- **Do** wrap display text balancing using text-wrap: balance.
- **Do** limit card border radii to a maximum of 12px for professional proportions.
- **Do** ensure all interactive buttons scale down to scale(0.97) on click.

### Don't:
- **Don't** use neon gradients or background-clip text accents.
- **Don't** pair borders with wide drop shadows (no ghost-cards).
- **Don't** use side-stripe borders larger than 1px as a colored accent indicator.
- **Don't** make layouts cluttered: keep columns clear and information tables clean.
