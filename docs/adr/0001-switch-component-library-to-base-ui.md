# ADR-0001: Switch the component library from Radix to Base UI

- **Status:** accepted
- **Date:** 2026-09-03
- **Deciders:** Director (approved in chat)

## Context

The registry shipped seven components in shadcn's `new-york` style, built on
individual Radix primitives (`@radix-ui/react-slot`, `react-dialog`,
`react-label`, `react-tabs`) and composed with Radix's `asChild` convention.

Adopting the registry into `atto1` as its first real consumer
([#10](https://github.com/deanjstone/design-system/issues/10)) surfaced a
mismatch: the shadcn CLI now offers three component-library bases and
**defaults to Base UI**. Consumers of this registry had to know to pass
`-b radix`, or they installed a dependency set that did not match what the
components actually import. That flag is invisible from inside this repo and
easy to miss — it was missed on the first adoption attempt.

`@base-ui/react` is at 1.7.0 and stable. (The `@base-ui-components/react`
package still sitting at `1.0.0-rc.0` is the superseded name; checking it
first gave a misleading read on maturity.)

## Decision

Replace the seven `new-york` Radix components wholesale with shadcn's
**`base-nova`** Base UI variants, sourced from shadcn's registry rather than
hand-ported.

Sources move from `registry/new-york/ui/` to `registry/base-nova/ui/`. The
`theme` item — tokens, the surface ramp, the opt-in gradients, and the
accessibility work in #31–#34 — is **unchanged**; only the components are
replaced.

## Consequences

**The registry sits on the CLI's default path.** A consumer runs
`shadcn init -b base` (the default) and `shadcn add`, and the installed
dependency set matches what the components import. `-b radix` is no longer a
prerequisite anyone has to discover.

**Upstream maintains the component implementations.** Fixes and new variants
arrive by re-pulling from shadcn rather than being hand-maintained here.

**The design language changes, and DESIGN.md's component-level claims changed
with it.** The canonical control height is now 32px (`h-8`) rather than 36px,
with four size variants (24/28/32/36px) instead of three; corners use
`rounded-lg` and `rounded-xl` rather than the `rounded-md` step; and the
destructive variant is tinted (`bg-destructive/10 text-destructive`) rather
than a solid fill. DESIGN.md is updated to match.

**`asChild` is gone.** Base UI composes through a `render` prop rather than
Radix's Slot, so any consumer calling `<Button asChild>` must change. Only
`atto1` had adopted, and its adoption is being redone.

**Accessibility is not regressed — and this was checked rather than assumed.**
The concern raised when this was proposed was that base-nova reintroduces
`focus-visible:ring-ring/50`, the translucent focus ring measured at 1.54:1
and fixed in #31. That framing was wrong. base-nova pairs the translucent ring
with `focus-visible:border-ring` — an **opaque** 1px border, on components
that all carry a border to colour. The perceivable indicator is that border,
measuring **3.64:1 in light and 4.18:1 in dark** against WCAG 1.4.11's 3:1.
The translucent ring is a glow layered on top. This is more robust than the
Radix pattern it replaces, where the translucent ring was the only indicator.

**`--destructive-foreground` becomes unused by the shipped components.** Added
in #33 to close the one fill/foreground pairing gap, it is no longer referenced
now that destructive is tinted. The token stays — it is a valid pairing and
consumers may use it — but nothing in the registry exercises it.

## Alternatives considered

**Port primitives, keep the design.** Swap the Radix imports for Base UI inside
the existing components, preserving 36px controls, the radius scale, the solid
destructive, and DESIGN.md as written. Rejected: it keeps this repo maintaining
seven hand-written components that diverge from upstream, which is the cost the
switch is meant to remove.

**Keep Radix, document the flag.** Zero churn; consumers pass `-b radix`
forever, guided by the README ([#36](https://github.com/deanjstone/design-system/issues/36)).
Rejected: it leaves the registry permanently off the CLI's default path, and
the flag is exactly the kind of invisible prerequisite that bit the first
adoption.
