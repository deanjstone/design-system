# design-system

Shared shadcn/ui component registry and design tokens, consumed by `myargus`,
`atto1`, `budget`, and `erto-apps` via the shadcn CLI. This repo is not a
buildable package — it's a plain GitHub-hosted registry: a `registry.json`
manifest plus the source files it points to. The shadcn CLI reads
`registry.json` directly from GitHub, resolves the referenced files, and
copies them into the consuming project. There's no publish step.

## Structure

```
registry.json              root manifest — one entry per distributable item
registry/
  lib/utils.ts              cn() helper (clsx + tailwind-merge)
  base-nova/ui/               base-nova style components (Base UI):
    button.tsx, card.tsx, label.tsx, input.tsx, dialog.tsx, tabs.tsx, badge.tsx
theme/tokens.css            same tokens as the "theme" item, as plain CSS
```

## Consuming this registry from another project

A consumer needs a `components.json` first, then pulls items straight from
GitHub by address:

```bash
npx shadcn init            # once per project, if there is no components.json
npx shadcn add deanjstone/design-system/theme
npx shadcn add deanjstone/design-system/button
```

This uses shadcn's native GitHub-registry support: any public repo with a
root `registry.json` is installable directly via `<owner>/<repo>/<item>`.
No `registries` entry in `components.json` is needed — see the warning
below for why you should not add one.

**`shadcn init` is a prerequisite, not an optional step.** `shadcn add`
cannot write anything without a `components.json`; run without one it stops
and prompts to create the file. `init` is also interactive by default — it
asks for a component library and a preset with arrow-key menus that cannot
be driven non-interactively — so scripted setups need both flags:

```bash
npx shadcn init -b base -p nova -y --css-variables
```

`-b base` is the CLI's own default and is what this registry expects: its
components are Base UI (`@base-ui/react`), per
[ADR-0001](docs/adr/0001-switch-component-library-to-base-ui.md). Passing
`-b radix` or `-b aria` installs a component library the registry's
components do not import.

**Add the font import.** The `theme` item owns the typeface
([ADR-0002](docs/adr/0002-registry-owns-the-font-token.md)) and declares
`@fontsource-variable/ibm-plex-sans` as a dependency, so the package
installs — but an `@import` has to precede every other rule in a stylesheet
and cannot be injected from a registry `css` block. Add it yourself, once,
at the top of your CSS entry:

```css
@import "@fontsource-variable/ibm-plex-sans";
```

Note the preset (`-p nova` above) also brings its own typeface and base
stylesheet. Pulling the `theme` item overrides `--font-sans`, so Plex wins,
but the preset's font package stays installed unless you remove it.

(Do **not** add this repo under `components.json`'s `registries` field with
a bare `registry.json` URL — that field requires a `{name}`-templated
per-item endpoint, e.g. `.../{name}.json`, which this repo doesn't publish.
A bare-URL entry fails the CLI's config validation and breaks every shadcn
command in the consumer, not just registry pulls. If a stable alias is ever
needed, it belongs under `registries` as `"@design-system": {"url":
"https://raw.githubusercontent.com/deanjstone/design-system/main/r/{name}.json"}`
pointing at real per-item output from `shadcn build` — not the root
`registry.json`.)

The CLI writes files into the consumer's own `aliases.ui` / `aliases.lib`
paths — components become that project's code, editable locally like any
other shadcn component. Updates are pulled explicitly, not auto-synced.

**Gotcha for Vite consumers with a TS solution-style `tsconfig.json`**
(references-only, with the real `@/*` alias living in a referenced
`tsconfig.app.json`): the shadcn CLI only reads the root `tsconfig.json`
for alias resolution, not files it references. If the root config has no
`paths`, the CLI won't error — it silently writes files into a literal
`./@/` directory instead of `./src/`. Fix is adding `baseUrl`/`paths`
directly to the root `tsconfig.json` (redundant with the referenced
config, but required for the CLI to find it).

**Gotcha for Vite consumers using the default React ESLint config:**
`button` exports `buttonVariants` alongside the component, which
`react-refresh/only-export-components` rejects. That is upstream shadcn's
convention across the whole ecosystem, so the fix belongs in the consumer's
lint config rather than in the component — editing the vendored file would
be overwritten by the next `shadcn add`:

```js
{
  files: ['src/components/ui/**/*.{ts,tsx}'],
  rules: { 'react-refresh/only-export-components': 'off' },
}
```

## Versioning

Releases are cut automatically by semantic-release from Conventional
Commits on `main` — there is no manual tagging step. A `fix:` bumps the
patch, a `feat:` the minor, and a `feat!:` or `BREAKING CHANGE:` footer the
major. Every release gets a `vX.Y.Z` tag, a GitHub release, and a CHANGELOG
entry.

**Consumers currently cannot pin, and should know it.** The
`<owner>/<repo>/<item>` shorthand always resolves against the default
branch — there is no ref in the address. Verified against the CLI: a tag in
the address (`design-system@v2.1.0/theme`, `design-system/theme@v2.1.0`),
a `github:` prefix, and a raw `registry.json` URL at a tag are all rejected;
only the unpinned form resolves.

So every `shadcn add` against this registry pulls whatever `main` holds at
that moment, and an `add` re-run can pull a breaking change without warning.
It has happened twice already: `v2.0.0` replaced Radix with Base UI
([ADR-0001](docs/adr/0001-switch-component-library-to-base-ui.md)) and
changed the component API from `asChild` to a `render` prop; `v2.1.0` took
ownership of the typeface
([ADR-0002](docs/adr/0002-registry-owns-the-font-token.md)), which changes
how every consumer looks.

Making the registry pinnable needs per-item output — `shadcn build` into
`r/{name}.json`, committed — so consumers can register a tagged, templated
URL under `components.json`'s `registries` field. Tracked in
[#43](https://github.com/deanjstone/design-system/issues/43). Until then,
read the CHANGELOG before re-running `add`, and treat a major bump as a
migration rather than an update.

## Adding a new component

1. Add the source file(s) under `registry/base-nova/ui/` (or `registry/lib/`
   for non-UI code).
2. Add a matching entry to `registry.json` — `name`, `type`
   (`registry:ui` / `registry:lib` / `registry:hook`), `files`, and any
   `registryDependencies` / `dependencies`.
3. Commit on a feature branch, open a PR — see `.claude/SYSTEM.md`.

## Design tooling

This repo enables the [impeccable](https://impeccable.style) plugin
(Apache-2.0 — one skill, 23 design commands, 61 anti-pattern rules) at
project scope via `.claude/settings.json`, and runs its detector over
`registry/` and `theme/` on every PR. The detector version is pinned
deliberately: its rule set *is* the pass/fail criterion, so an unpinned
range would let an upstream release redden a green PR with no change here.

**Gotcha: `enabledPlugins` does not install the plugin.** Enable and
install are separate steps, and the gap is silent. A fresh clone will read
`extraKnownMarketplaces`, fetch the marketplace, cache the plugin — and
then never load it, no matter how many times Claude Code restarts.
`claude plugin enable` reports `already enabled at project scope` while
`~/.claude/plugins/installed_plugins.json` has no entry and the cache gets
garbage-collected as orphaned. Run the install once per machine:

```bash
claude plugin install impeccable@impeccable --scope project
```

Then restart the session — plugins are read at startup. Verify with
`claude plugin list`, which should report `Scope: project` and
`Status: ✔ enabled` for it, rather than assuming a restart was enough.

`/impeccable document`, `extract`, `audit` and `critique` are the commands
that earn their place here. `/impeccable live` does not apply — it
iterates against a running app, and this repo has none.

## Style

- `base-nova` shadcn style, OKLCH color tokens, Tailwind v4 (`@theme inline`,
  no `tailwind.config.js`).
- Base UI (`@base-ui/react`) primitives under the hood; components are copied,
  not installed as a dependency — once pulled into a consumer, edit them there.
  Composition uses Base UI's `render` prop, not Radix's `asChild`.
  Switched from `new-york`/Radix in [ADR-0001](docs/adr/0001-switch-component-library-to-base-ui.md).
- The `theme` item ships the full token set: core colors (background,
  foreground, primary/secondary/accent/muted, destructive, border/input/
  ring), plus `--radius`, `--card`, `--popover`, `--chart-1..5`, and
  `--font-sans` (IBM Plex Sans — typeface is mechanics here, not identity;
  see [ADR-0002](docs/adr/0002-registry-owns-the-font-token.md)).
- Opt-in additions to the `theme` item (no effect unless a consumer uses
  the utilities): a 6-step `surface-0..5` dark-elevation ramp plus
  `surface-border`/`surface-border-light`, `pulse-slow`/`fade-in`/
  `slide-up` animations, `.card`/`.card-hover`/`.btn-primary`/`.btn-ghost`/
  `.badge`/`.input` plain-CSS component recipes, and `.dark`-scoped
  scrollbar/selection/calendar-picker-icon styling for always-dark apps.
- Available components: `button`, `card`, `label`, `input`, `dialog`,
  `tabs`, `badge` — all `base-nova` style, Base UI-based, pulled from the
  registry the same way as `theme`/`button` above.
