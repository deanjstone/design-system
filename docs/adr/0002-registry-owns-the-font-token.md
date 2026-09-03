# ADR-0002: The registry owns the font token

- **Status:** accepted
- **Date:** 2026-09-03
- **Deciders:** Director (approved in chat)
- **Resolves:** [#37](https://github.com/deanjstone/design-system/issues/37)

## Context

The registry shipped no font token. DESIGN.md recorded that as an **open gap
rather than a doctrine**: the system defined type roles — size, weight,
line-height — and inherited the family from whatever the consuming app set.
Nobody had decided it either way; it was simply how the code had turned out.

Adopting into `atto1` turned the gap into a live problem. `shadcn init`
requires a preset, every preset carries a typeface, and the one used installed
Geist. **atto1 rendered in a font nobody chose** — the most visible property of
its UI decided by a CLI flag needing a value. Every future consumer would land
on whatever preset they happened to pick, and the four apps would drift apart
by accident rather than by intent.

That cut against the map's destination, which has atto1 building its UI
*entirely* from design-system pulls.

## Decision

**Typeface is mechanics, not identity. The registry owns it.**

`--font-sans` ships in the `theme` item as
`"IBM Plex Sans Variable", "IBM Plex Sans", ui-sans-serif, system-ui,
sans-serif`, mapped through `@theme inline` so `font-sans` utilities resolve to
it. The `theme` item declares `@fontsource-variable/ibm-plex-sans` as a
dependency.

## Rationale

The system's North Star is that the registry is deliberately identity-free —
chroma-zero, so four apps do not end up looking like each other. Typeface is
the one place that stance does not hold, and the distinguishing test is
concrete rather than aesthetic:

**Colour is identity; type is mechanics.** The component metrics assume a face
that genuinely has what they ask for — a true 500 *and* 600, figures that hold
a column, a 0.8rem step that still reads at 28px. A consumer supplying a
display face does not merely look different; the rhythm breaks. Anything the
metrics depend on belongs to the registry.

**IBM Plex Sans over the obvious candidates**, for two reasons that were
measured rather than preferred:

- It was drawn for technical and data contexts, so its lining figures hold up
  in `budget`'s ledgers and `atto1`'s range tracking — contexts the `chart-1..5`
  tokens already anticipate.
- Unlike Inter and Geist it is **not** on impeccable's `overused-font` list.
  Verified directly: `font-family: Inter` and `font-family: Geist` are both
  flagged; `font-family: "IBM Plex Sans"` is not. Choosing either of the first
  two would hand every consumer running the detector a permanent advisory
  finding, inherited from a decision this registry made on their behalf.

The rule fires on `font-family:` declarations, not on `--font-*` token
declarations, so the registry's own CI would not have caught this — the cost
would have landed entirely on consumers.

## Consequences

**The four apps share a face by default.** That is the point, and it is a real
narrowing of consumer freedom: a consumer wanting a different typeface now
overrides a token rather than filling a vacuum. Overriding `--font-sans` locally
remains supported and is the intended escape hatch.

**Consumers must add one import line themselves.** An `@import` has to precede
every other rule in a stylesheet and cannot be injected from a registry `css`
block, so declaring the dependency installs the package but does not wire it:

```css
@import "@fontsource-variable/ibm-plex-sans";
```

Documented in the README and DESIGN.md rather than left to be discovered.

**atto1 changes appearance.** It had inherited Geist from the nova preset; it
now renders in Plex. That is the accident being corrected, not a regression.

**DESIGN.md's Typography section stops being a placeholder.** It was written to
be the place this decision landed; it now records it, and every type role
carries `fontFamily`.

## Alternatives considered

**Consumer owns it, documented as a deliberate boundary.** Cheapest, and
preserves the North Star intact. Rejected: it leaves four apps drifting on
whichever preset each happened to pick, which is what produced the problem.

**Registry ships an optional font item.** Mirrors how the opt-in gradient
accents already work — registry offers, consumer opts in. Rejected as the wrong
shape for something the component metrics *depend* on: an opt-in that the
system breaks without is not really optional.
