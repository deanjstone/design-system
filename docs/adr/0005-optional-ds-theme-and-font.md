# ADR-0005: The DS theme and the Aspekta font are opt-in items

- **Status:** accepted
- **Date:** 2026-11-10
- **Deciders:** Director (owner grill, argus-config#1150, decision 5)
- **Resolves:** [#189](https://github.com/deanjstone/design-system/issues/189)

## Context

The owner wants a look borrowed from DS Code (tinted-neutral dark scale, sheen, hairline
edges, squircle corners, recessed wells) and the Aspekta and Azeret Mono typefaces, as
options chosen per device in app settings. The default look must not change for anyone who
does not opt in. [ADR-0002](0002-registry-owns-the-font-token.md) made the typeface a
registry decision (IBM Plex Sans), so a second face needs to say why it is not a breach.

## Decision

1. **The look is a seventh theme, `ds`, in its own `theme-ds` item.** It is selected like
   the other themes (`data-theme="ds"`, the `ds-theme` cookie) but is not in `THEMES`: it is
   in `ALL_THEMES`, which an app passes to `AppearanceSection` to list it. Every selector
   in the item is scoped to `[data-theme="ds"]`.
2. **The font is a separate choice, `data-font="aspekta"`, in its own `font-aspekta` item**
   and its own cookie (`ds-font`). The default font sets no attribute. It does not touch
   `--font-sans-stack` outside that attribute, so Plex stays what ADR-0002 says it is.
3. **The font files are the originals, installed by a script, not by the shadcn CLI.** The
   CLI reads files as UTF-8 text and corrupts a binary (verified with `shadcn@4.19.1`), and
   Aspekta's Reserved Font Name forbids a modified or renamed copy. The files are committed
   byte for byte with their upstream git blob ids and sha256 (`registry/fonts/fonts.json`);
   `install-ds-fonts.sh` downloads them from the pinned upstream commit and checks the sha256.
   The licence texts ship as plain files with the item.

## Consequences

- An app that never installs either item, or installs them and never offers the choice, is
  byte-for-byte what it was. `settings-page` gains optional props only.
- ADR-0002's "typeface is mechanics" holds for the default; Aspekta is an explicit,
  per-device opt-out of it. The component metrics were checked against Aspekta at 390 and
  320 px (`docs/ds-theme/screenshots.mjs`), not assumed.
- `font-aspekta` needs one extra step from an app (run the script, import the stylesheet), and
  its `src` urls assume `public/` is served from the root.
- Squircle corners show only where the browser implements `corner-shape` (Chromium today).

## Alternatives considered

**Put DS into the `theme` item as a seventh palette.** Rejected: every consumer would ship its
CSS, and the "default unchanged" test would have to argue the point instead of proving it.

**Ship the fonts as base64 inside the stylesheet.** Rejected: it is a re-encoded, not original,
copy, and it puts about 150 KB in every page's CSS instead of a lazily fetched file.

**Fontsource packages.** Rejected for this option: they republish the fonts, and the owner's
brief names the fonts' own releases.
