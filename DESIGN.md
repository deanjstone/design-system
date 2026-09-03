---
name: design-system
description: An achromatic shadcn/ui token layer four apps tint with their own identity.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.145 0 0)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.145 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.97 0 0)"
  secondary-foreground: "oklch(0.205 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  accent: "oklch(0.97 0 0)"
  accent-foreground: "oklch(0.205 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  destructive-foreground: "oklch(1 0 0)"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.64 0 0)"
  ring: "oklch(0.62 0 0)"
  chart-1: "oklch(0.646 0.222 41.116)"
  chart-2: "oklch(0.6 0.118 184.704)"
  chart-3: "oklch(0.398 0.07 227.392)"
  chart-4: "oklch(0.828 0.189 84.429)"
  chart-5: "oklch(0.769 0.188 70.08)"
  surface-0: "#06060a"
  surface-1: "#0c0c14"
  surface-2: "#13131e"
  surface-3: "#1a1a28"
  surface-4: "#222233"
  surface-5: "#2a2a3d"
  surface-border: "#2a2a3d"
  surface-border-light: "#72729c"
  accent-orchid-1: "#a21caf"
  accent-orchid-2: "#4338ca"
  accent-nebula-1: "#0369a1"
  accent-nebula-2: "#6d28d9"
  accent-lagoon-1: "#134e4a"
  accent-lagoon-2: "#0e7490"
  accent-garnet-1: "#881337"
  accent-garnet-2: "#e11d48"
typography:
  headline:
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1
  title:
    fontWeight: 600
    lineHeight: 1
  body:
    fontSize: "0.875rem"
    fontWeight: 400
  label:
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1
  label-sm:
    fontSize: "0.8rem"
    fontWeight: 500
    lineHeight: 1
  caption:
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.lg}"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "32px"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.destructive}"
    rounded: "{rounded.lg}"
    height: "32px"
  button-xs:
    rounded: "{rounded.md}"
    height: "24px"
    typography: "{typography.caption}"
  button-sm:
    rounded: "{rounded.md}"
    height: "28px"
  button-lg:
    rounded: "{rounded.lg}"
    height: "36px"
  button-icon:
    rounded: "{rounded.lg}"
    height: "32px"
    width: "32px"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    height: "20px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "32px"
  tabs-list:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.lg}"
    height: "32px"
  tabs-trigger-active:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  dialog-content:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: design-system

## Overview

**Creative North Star: "The Neutral Substrate"**

This is a foundation, not a face. Every core token in the palette is
chroma-zero — literally hueless — and that is the whole thesis. The registry
is consumed by four separate applications (`myargus`, `atto1`, `budget`,
`erto-apps`), and identity is something each of them adds on top, never
something this layer imposes from below. A shared system that arrived with
opinions about brand colour would force four apps to look like each other.

What it does own is rhythm and mechanics: a 32px canonical control height, a
single radius variable everything else derives from, a consistent focus
treatment, and hover states that shift opacity rather than swapping colour. The
restraint is not minimalism for its own sake — it is what makes the layer
safe to share. Colour is a guest here, not a resident.

Depth is the one place the system genuinely runs two mechanisms rather than
one, and it does so deliberately: light-mode consumers get borders and
hairline shadows, always-dark consumers get a six-step tonal ramp. Both
express the same intent through the materials their mode actually has.

**Key Characteristics:**

- Chroma-zero core; the only chromatic core token is `destructive`
- One radius variable (`--radius: 0.625rem`) generates the entire corner scale
- 32px is the canonical control height across button, input, and tabs
- Colour arrives only as signal, data, or an explicit consumer opt-in
- No build step — components are copied into consumers and edited there

## Colors

Paper and void. Light mode runs paper-white through graphite in pure
neutrals; the `surface-0..5` ramp is a near-black void that climbs toward
indigo, built for consumers that live in permanent dark.

### Primary

- **Graphite** (`oklch(0.205 0 0)`): The filled default for buttons and
  badges, and the `.dark` selection background. Near-black rather than true
  black, so it reads as ink rather than a hole. In dark mode this token and
  its foreground invert wholesale, which is why nothing hardcodes either.

### Neutral

- **Paper** (`oklch(1 0 0)`): Pure white. The `background`, `card`, and
  `popover` ground in light mode; all three are deliberately the same value,
  so containers are distinguished by border rather than fill.
- **Ink** (`oklch(0.145 0 0)`): Body text and the dark-mode ground. The
  system's darkest neutral.
- **Whisper** (`oklch(0.97 0 0)`): `secondary`, `muted`, and `accent` share
  this one value — the faintest tint that still separates from Paper. It is
  the hover fill for ghost and outline buttons.
- **Quiet Text** (`oklch(0.556 0 0)`): `muted-foreground`. Card descriptions,
  placeholders, and inactive tab labels.
- **Hairline** (`oklch(0.922 0 0)`): `border`, used for container edges. In
  dark mode it becomes translucent white (`oklch(1 0 0 / 10%)`) so edges sit
  *on* the surface rather than beside it.
- **Field Edge** (`oklch(0.64 0 0)`): `input`. Deliberately darker than
  Hairline — an input's border is its only boundary, so it must clear 3:1
  against the ground (WCAG 1.4.11) where a decorative container border need
  not. Dark mode carries the same requirement at `oklch(1 0 0 / 40%)`.
- **Ring** (`oklch(0.62 0 0)`): The focus indicator, rendered opaque across a
  3px spread. Opacity is not applied to it: a half-transparent ring
  composites into the background and drops below the 3:1 floor.

### The Void Ramp

Six steps from `#06060a` to `#2a2a3d`, plus `surface-border` (`#2a2a3d`) and
`surface-border-light` (`#72729c`). Unlike every other colour here, these
hold **the same values in light and dark** — they are not a themed pair but a
dark-only elevation ladder that does nothing until a consumer opts in by
using the `surface-*` utilities. Each step carries a faint blue cast rather
than being true neutral, which is what keeps a stack of them from reading as
flat grey.

### Signal

- **Alarm** (`oklch(0.577 0.245 27.325)`): `destructive`, paired with
  `destructive-foreground` (`oklch(1 0 0)`). White is correct on the fill in
  both modes (4.76:1 light, 4.72:1 dark), but it is a token rather than a
  literal so a consumer who overrides the fill can correct its text with it.
  The only chromatic
  colour in the core palette, and the clearest statement of the system's
  position — colour means something here.
- **Chart 1–5**: The one place a full hue range is sanctioned, because data
  series need to be told apart. Light and dark ship different values.

### Opt-In Accents

Four approved gradient pairs, each a two-stop `linear-gradient(115deg, …)`:
**Orchid** (`#a21caf` → `#4338ca`), **Nebula** (`#0369a1` → `#6d28d9`),
**Lagoon** (`#134e4a` → `#0e7490`), **Garnet** (`#881337` → `#e11d48`).
Every stop independently clears WCAG AA (4.5:1) against white button text.
Each family also ships a lighter `-1-dark` stop (`#f0abfc`, `#7dd3fc`,
`#5eead4`, `#fda4af`) for use as an accent on a dark ground.

### Named Rules

**The Guest Rule.** Colour is a guest, not a resident. The core palette is
chroma-zero on purpose; any hue that appears must be carrying meaning —
danger, a data series, or an accent a consumer deliberately chose.

**The Opt-In Accent Rule.** Choosing a gradient has *no effect* on the flat
`primary`/`accent` tokens. The four candidates are additive utilities, not a
brand decision made on the consumer's behalf. A consumer that picks none is
in a fully supported state, not an unfinished one.

## Typography

**Font family: none.** This system ships no font tokens at all — no
`--font-*` declarations, no `fontFamily` in the frontmatter. Components
specify size, weight, and line-height only, and inherit whatever stack the
consuming application sets.

This is recorded as an **open gap, not a doctrine.** Each of the four
consumers currently picks its own family, and the resulting cross-app
inconsistency is a known cost that has not been decided on either way.
Anyone resolving it should treat this section as the place the decision
lands, not as evidence that delegation was the intent.

### Hierarchy

- **Headline** (600, 1.125rem, line-height 1): Dialog titles. The largest
  type the system defines.
- **Title** (600, inherited size, line-height 1): Card titles. Deliberately
  unsized — it takes the consumer's base size and asserts only weight.
- **Body** (400, 0.875rem): Default UI text. Inputs step up to 1rem below the
  `md` breakpoint to prevent iOS zoom-on-focus, then back down.
- **Label** (500, 0.875rem, line-height 1): Form labels and button text.
- **Label-sm** (500, 0.8rem, line-height 1): The small button variant only.
  An odd step, and a real one — it exists so a 28px control's text stays
  optically centred without dropping all the way to caption size.
- **Caption** (500, 0.75rem): Badges and small buttons.

## Layout

No custom spacing scale is defined; the system uses Tailwind's default steps
and simply uses them consistently. The observed rhythm is a 4px base with a
strong preference for even multiples: **4px** inside dense controls,
**8px** for inline gaps and badge padding, **12px** for input side padding,
**16px** for default button padding and card header gaps, **24px** for card
padding and dialog interiors, **32px** for large button padding.

Cards are the clearest expression: 24px vertical padding on the container,
24px horizontal on every child region, and a 24px gap between regions, so a
card reads as one uniform inset regardless of how many sections it holds. The
card header is a container query context (`@container/card-header`), letting
headers respond to their own width rather than the viewport.

Dialogs are the only component with a width opinion: full width minus a 2rem
inset, capped at 32rem from the `sm` breakpoint up, centred by transform.

### Adapting to input, not to width

The system adapts on **input capability rather than viewport width**, because
width does not tell you what is touching the screen: a large tablet is still a
finger, and a narrow desktop window is still a mouse.

- **`pointer: coarse`** raises interactive controls to a 44px minimum. The
  36px canonical height clears WCAG 2.5.8 (24px) but sits under the iOS HIG
  and Material recommendations, so the floor is lifted only where the input is
  actually a finger — the density the system is built around survives on
  pointer devices.
- **`hover: hover`** guards every hover treatment. Hover is not a state a
  touch device can leave; without the guard, tapping a `.card-hover` element
  leaves it stuck in its hover fill until something else is tapped.

Both rules are deliberately **unlayered**. Tailwind utilities live in a
cascade layer, and unlayered styles win over layered ones regardless of
specificity — which is how the 44px touch floor outranks a `min-w-0` shrink
utility on the same element.

### Named Rules

**The Capability Rule.** Adapt to what the device can do, not how wide it is.
A width breakpoint is the wrong tool for a question about fingers and hover.

## Elevation & Depth

**This system runs two depth mechanisms, chosen by mode, not one ladder
applied everywhere.**

In light mode, depth is carried by borders and near-invisible shadows.
Buttons and inputs take `shadow-xs`, cards and the active tab take
`shadow-sm`, and only the dialog takes real lift with `shadow-lg` — because
it genuinely floats above everything else. At these values the shadows are
structural hairlines that separate a surface from its neighbour; they are not
atmosphere, and nothing glows.

In always-dark consumers, shadows stop working — a black shadow on a
near-black ground is invisible. Those consumers convey the same hierarchy
through the tonal `surface-0..5` ramp instead: a higher surface is a lighter
step, not a shadowed one. Same intent, different material.

### Shadow Vocabulary

- **Control** (`shadow-xs`): Buttons and inputs at rest. Separates an
  interactive element from the page without implying it floats.
- **Container** (`shadow-sm`): Cards and the active tab trigger. Marks a
  resting surface.
- **Overlay** (`shadow-lg`): Dialog content only. The single component
  allowed to look airborne.

### Named Rules

**The Two Systems Rule.** Never mix the mechanisms. A light-mode surface
gains depth from a border and a hairline shadow; a dark-mode surface gains it
from the next step up the ramp. Stacking both produces a muddy edge that
reads as neither.

**The Overlay-Only Lift Rule.** `shadow-lg` belongs to the dialog. If a new
component seems to need it, the real question is whether that component
should be an overlay at all.

## Shapes

Every corner in the system derives from one variable. `--radius` is
`0.625rem` (10px), and the scale is generated from it by arithmetic:
`sm` = radius − 4px (6px), `md` = radius − 2px (8px), `lg` = radius (10px),
`xl` = radius + 4px (14px). Changing the single variable rescales every
component's corners in proportion, which is the point.

In practice: buttons, inputs, and the tab list take **lg** (10px); the active
tab trigger takes **md** (8px); cards and dialogs take **xl** (14px), making
them the softest shapes in the system. The xs and sm button variants clamp to
`min(var(--radius-md), 10px)` so a smaller control never out-rounds its
container. Badges and scrollbar thumbs break the scale entirely with a full
pill, which is what marks a badge as a label rather than a container.

Borders are uniformly 1px and hairline-weight. There is no decorative
stroke, no double border, and no clipping geometry anywhere in the system.

### Named Rules

**The One Variable Rule.** Radius values are never hardcoded. If a component
needs a corner, it takes a step off the scale — a literal px radius means the
scale was wrong, not that the component is special.

## Components

Refined and restrained. Nothing here is louder than it needs to be:
components sit at a uniform height, shift by opacity on hover rather than
changing colour outright, and reserve their assertive gesture — an opaque
border plus a translucent ring — for keyboard users who need it.

Composition is Base UI's `render` prop throughout. There is no `asChild`.

### Focus, system-wide

Every focusable component uses the same two-layer treatment: `border-ring`
turns the element's existing (usually transparent) 1px border opaque, and a
3px `ring-ring/50` glow sits outside it. **The opaque border is the part that
carries the signal** — 3.64:1 in light and 4.18:1 in dark against WCAG
1.4.11's 3:1 — with the translucent ring reading as atmosphere rather than
the indicator. Applied on `focus-visible`, so pointer users never see it.

### Buttons

- **Shape:** 10px (`rounded-lg`); the xs and sm variants tighten to the
  `--radius-md` step, capped so they never out-round the container.
- **Height:** 32px default, with 24px (xs), 28px (sm) and 36px (lg). The icon
  variant is a 32px square.
- **Default:** Graphite fill, near-white text, dropping to 80% of its own fill
  on hover.
- **Destructive:** A **tinted** treatment — `destructive` text on a 10%
  `destructive` wash — not a solid fill. It reads as a warning rather than a
  primary action, which is the point.
- **Outline / Secondary / Ghost:** Hairline border on the page ground, Whisper
  fill, and transparent respectively; outline and ghost both resolve to a
  muted hover, so they converge on interaction.
- **Link:** Text-only in Graphite with a 4px underline offset.
- **Active:** A 1px downward translate on press, suppressed on menu triggers.
- **Disabled:** 50% opacity and pointer events off.

### Badges

- **Shape:** Full pill (`rounded-4xl`), 20px tall, 0.75rem medium text.
- **Behaviour:** Composes through `render`, so a badge can become a link
  without a wrapper.

### Cards

- **Corner:** 14px (`rounded-xl`), the softest shape in the system, with the
  header and footer regions rounding to match at top and bottom.
- **Background:** `card` on `card-foreground` with a 1px hairline border.
- **Structure:** Header, Title, Description, Action, Content and Footer, with
  the header growing a second column only when an Action is present.

### Inputs

- **Style:** Transparent ground with a 1px `input` border at 10px radius,
  32px tall.
- **Focus:** Border shifts to `ring` with the 3px glow — the same gesture as
  every other focusable component.
- **Invalid:** `aria-invalid` drives a destructive border and ring; the
  attribute is the trigger, not a class.

### Tabs

- **List:** Muted track at 10px radius, 32px tall.
- **Active trigger:** Lifts to the page background at the 8px step, reading as
  raised out of its groove.
- **Inactive:** Transparent with a transparent border, so activation adds
  colour without shifting geometry.

### Dialog

- **Content:** Page background, 1px border, 14px radius, 24px padding,
  centred, with a fade-and-scale entrance.
- **Composition:** Depends on the `button` item — pulling `dialog` alone pulls
  `button` with it.

### Labels

Medium 0.875rem that dims to 50% when its associated control is disabled, so
the label tracks the field's state rather than sitting inert beside it.

## Do's and Don'ts

### Do:

- **Do** take every colour from a semantic token (`bg-primary`,
  `text-muted-foreground`). Both modes are defined; hardcoding a value breaks
  one of them.
- **Do** derive corners from the radius scale so a change to `--radius`
  rescales the whole system.
- **Do** keep interactive controls at 32px. Button, input, and tab list all
  agree on this height, and mixed heights in a row are immediately visible.
- **Do** express hover as an opacity shift on the existing fill (`/90`,
  `/80`) rather than a different colour.
- **Do** use `focus-visible` with the opaque 3px ring, so pointer users never
  see a ring that keyboard users depend on.
- **Do** drive invalid state from `aria-invalid`, keeping the accessible
  attribute and the visual treatment inseparable.
- **Do** pair every new component with a `registry.json` entry in the same
  commit — a source file the manifest does not list is unreachable.

### Don't:

- **Don't** introduce a brand hue into the core palette. Chroma-zero is the
  system's central commitment, and four consumers depend on supplying their
  own identity.
- **Don't** treat the `surface-*` ramp as a light-mode tool. It holds the same
  values in both modes and only makes sense under an always-dark consumer.
- **Don't** stack a tonal surface step and a shadow on the same element —
  pick the mechanism that belongs to the mode.
- **Don't** reach for `shadow-lg` outside an overlay.
- **Don't** add a font-family token casually. The absence is an unresolved
  gap affecting four applications, not a slot to fill in passing.
- **Don't** assume choosing a gradient accent changes anything else. The
  gradients are additive utilities and leave the flat tokens untouched.
- **Don't** reach for a width breakpoint to solve a touch or hover problem.
  Use `pointer` and `hover` capability queries; a wide screen is not a mouse.
- **Don't** apply an opacity modifier to `ring`, `input`, or any other token
  whose job is to make a boundary or state perceivable. Compositing halves the
  contrast and silently breaks WCAG 1.4.11.
- **Don't** use `surface-*` values in a rule that is not scoped under `.dark`.
  The ramp holds the same value in both modes, so an unscoped rule applies
  dark-only colours to light-mode consumers.
- **Don't** hardcode white or black. Two literals remain by design and no
  more: the gradient button's text, whose four fills are fixed hues chosen so
  white clears AA against all of them, and the dialog overlay's `bg-black/50`
  scrim. Both are single local exceptions; neither earns a system token.
