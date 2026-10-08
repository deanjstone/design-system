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
  base-nova/ui/               39 base-nova style components (Base UI)
  base-nova/hooks/            use-mobile (pulled by sidebar)
r/                         generated per-item output — what the r/ alias resolves
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

An unpinned `shadcn add deanjstone/design-system/<item>` pulls whatever
`main` holds at that moment, so an `add` re-run can pull a breaking change
without warning. It has happened twice: `v2.0.0` replaced Radix with Base UI
([ADR-0001](docs/adr/0001-switch-component-library-to-base-ui.md)) and
changed the component API from `asChild` to a `render` prop; `v2.1.0` took
ownership of the typeface
([ADR-0002](docs/adr/0002-registry-owns-the-font-token.md)), which changes
how every consumer looks.

### Pinning to a release

**A pin fixes the item you name, not its dependencies.** Both pinning forms
below install the named item from the release you choose. Every
`registryDependencies` entry is still resolved from `main`, because this
registry writes them as unversioned addresses
(`deanjstone/design-system/<name>`) and shadcn does not carry a ref across
dependencies. shadcn's docs say: "Refs are not inherited across
dependencies. If a dependency should be pinned, include its own ref."
([GitHub Registries](https://ui.shadcn.com/docs/registry/github), read
2026-10-08). Only `theme`, `utils` and `use-mobile` have no registry
dependencies. Almost every other item depends on at least `utils`.

**Option 1: a `#ref` on the item address (preferred).** shadcn 4.x accepts
a branch, tag or commit SHA after `#`:

```bash
npx shadcn add deanjstone/design-system/button#v2.5.1
npx shadcn add deanjstone/design-system/button#645db462137cf60b416d8ee4fc753146c5e0b51d
```

A tag works for every release. A full 40-character SHA is the most
reproducible ref and skips the CLI's `git ls-remote` lookup. Both work
without a `components.json` `registries` entry.

**Option 2: the `r/` alias.** `r/` holds per-item output from
`shadcn build`, one self-contained JSON per item with the source inlined.
A tag includes `r/`, so a tagged raw URL serves the item exactly as it
shipped. Register the alias once in the consumer's `components.json`:

```json
{
  "registries": {
    "@design-system": {
      "url": "https://raw.githubusercontent.com/deanjstone/design-system/v2.5.1/r/{name}.json"
    }
  }
}
```

then add by alias:

```bash
npx shadcn add @design-system/theme @design-system/button
```

This is the `{name}`-templated endpoint the warning above refers to, the
thing a bare `registry.json` URL cannot be. `r/` exists from `v2.2.0`
onward.

**Which to use.** The two forms pin the same thing: the named item, at the
tag. Their dependency behaviour is identical. Use `#ref` by default. It is
the form shadcn documents, it needs no config, and it can name a commit
SHA. Use the alias when a project wants one place to set the version: it
upgrades every later `add` by bumping a single URL. Use the unpinned
shorthand only to track `main` on purpose.

**What this means in practice.** `shadcn add` copies source into the
consumer's repo, so the code you commit is the real pin. A later `add`
changes nothing until it runs. Review its diff the way you would review any
dependency upgrade, including files pulled in as dependencies. Passing each
dependency explicitly with its own `#ref` in the same command does **not**
work around this: the dependency's `main` copy wins (see below). If an
install must be fully reproducible today, pin and add only leaf items
(`theme`, `utils`, `use-mobile`). For anything else, inspect the dependency
files the CLI writes. Pinning dependencies at release time is tracked in
design-system#65: it changes how `registryDependencies` are written, which is a
breaking change for consumers.

Verified 2026-10-08 with `shadcn@4.21.4`, in a fresh Vite app with
`init -b base -p nova`. Every `fetch` and `git` call the CLI made was logged
(design-system#59):

| Command | Named item from | Dependencies from |
|---|---|---|
| `add deanjstone/design-system/sidebar#v2.5.1` | `645db46` (the `v2.5.1` tag) | `main` HEAD, all 8 |
| `add deanjstone/design-system/button#645db46…` (full SHA) | that commit, no `ls-remote` for it | `utils` from `main` HEAD |
| `add @design-system/sidebar` (alias at `v2.5.1`) | `v2.5.1/r/sidebar.json` | `main` HEAD, all 8 |
| `add …/separator#v2.3.0` | `v2.3.0` | — |
| `add …/sidebar#v2.5.1 …/separator#v2.3.0` (either order) | — | `separator` from `main` |

Tags before `v2.5.0` behave worse. Their dependencies are bare names such
as `utils`, which resolve to **upstream shadcn's** items, not this
registry's (design-system#57).

`r/` is generated. Rebuild it with `npx shadcn build --output ./r` whenever
`registry.json` or a source file changes. CI rebuilds it and fails on any
difference, because a stale `r/` would serve a tag's consumers older code
than the tag claims.

## Adding a new component

1. Add the source file(s) under `registry/base-nova/ui/` (or `registry/lib/`
   for non-UI code).
2. Add a matching entry to `registry.json` — `name`, `type`
   (`registry:ui` / `registry:lib` / `registry:hook`), `files`, and any
   `registryDependencies` / `dependencies`.

   A `registryDependencies` entry naming another item in this repo must use
   its full address, `deanjstone/design-system/<name>`. A bare name such as
   `button` means shadcn's built-in item, not ours, so the consumer silently
   gets upstream's copy (design-system#57).

   Pin a pre-1.0 npm dependency to its minor, e.g. `@shadcn/react@^0.3.1`,
   so a re-run `shadcn add` cannot pull a breaking release.
3. Commit on a feature branch, open a PR — see `.claude/SYSTEM.md`.

## Tests

`pnpm install && pnpm test` renders registry sources in jsdom with Vitest
(`test/`); the `Test` workflow runs it on every PR. The dev dependencies
exist only for this — nothing here is built or published.

**Gotcha: Base UI parts with default children.** `Select.Icon`,
`Combobox.Icon` and `NavigationMenu.Icon` default their children to `▼`
(also `Combobox.ItemIndicator` `✔️`, `Combobox.Clear` `x`). `render` swaps
only the element, so the glyph lands inside whatever you render — a lucide
svg appends it as a stray text node. Give these parts an explicit child,
`{null}` if the rendered element supplies its own (design-system#50).

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
  `.badge`/`.input` plain-CSS component recipes, `.dark`-scoped
  selection/calendar-picker-icon styling for always-dark apps, a tokenized
  scrollbar thumb (both modes), `radius-2xl`/`radius-3xl`, `surface-glass`/
  `dialog-glass`/`dropdown-glass`/`surface-grain` opt-in chrome textures, and
  PWA/Electron app-shell mechanics (`pt-safe`/`pb-safe`/`pl-safe`/`pr-safe`,
  `--app-titlebar-*` topbar geometry, the `.wco` variant, `.drag-region`) —
  see [DESIGN.md](DESIGN.md#app-shell).
- **39 components** and one hook, all `base-nova` style and Base UI-based, pulled the same
  way as `theme`/`button` above:
  - *Controls* — `button`, `input`, `textarea`, `select`, `checkbox`,
    `switch`, `slider`, `label`
  - *Surfaces and overlays* — `card`, `dialog`, `alert-dialog`, `sheet`,
    `drawer`, `popover`, `dropdown-menu`, `collapsible`, `scroll-area`
  - *Display and feedback* — `badge`, `avatar`, `progress`, `skeleton`,
    `separator`, `tabs`, `sonner`, `spinner`, `empty`, `tooltip`
  - *Conversation* — `message`, `bubble`, `message-scroller`, `marker`,
    `attachment`
  - *Navigation and lists* — `sidebar` (with the `use-mobile` hook), `item`
  - *Forms and grouping* — `field`, `input-group`, `toggle`, `toggle-group`,
    `button-group`

  `tooltip` and `sidebar` need a `TooltipProvider` at the app root.
  `message-scroller` adds the `@shadcn/react` package.

  The set is bounded to what the consuming apps actually use — 39 of shadcn's
  ~65 — rather than shipping the full catalogue. Adding another is mechanical,
  so ask rather than vendoring a copy locally.
