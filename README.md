# design-system

Shared shadcn/ui component registry and design tokens, consumed by `myargus`,
`atto1`, `argus`, `homelab` and `quick-capture` via the shadcn CLI (`slate-reader`
vendors LinkPill; `budget` is migrating — see [Consumers](#consumers)). This
repo is not a
buildable package — it's a plain GitHub-hosted registry: a `registry.json`
manifest plus the source files it points to. The shadcn CLI reads
`registry.json` directly from GitHub, resolves the referenced files, and
copies them into the consuming project. There's no publish step.

## Consumers

This list is how a registry change is checked for downstream breakage, so keep
it true. Pins are the `@design-system` alias version in each repo's
`components.json` on `main`, read on 2026-10-29. The alias is where the next
`add` will pull from; the code already in the repo is whatever was last pulled.

| Consumer | Path | Pin | Status |
|---|---|---|---|
| `argus` | `apps/email` | v2.5.3 | consuming |
| `argus` | `apps/ops-hub-web` | v2.8.0 | consuming ([argus#728](https://github.com/deanjstone/argus/issues/728)) |
| `argus` | `apps/watchtower` | v2.7.0 | consuming ([argus#674](https://github.com/deanjstone/argus/issues/674)) |
| `homelab` | `services/scan-app/web` | v2.8.0 | consuming ([homelab#181](https://github.com/deanjstone/homelab/issues/181)) |
| `atto1` | repo root | v2.6.0 | consuming |
| `quick-capture` | `web` | v2.6.0 | consuming (split out of `homelab` `services/quick-capture/web` in [homelab#228](https://github.com/deanjstone/homelab/issues/228)) |
| `myargus` | `apps/knowledge`, `apps/reader` | v2.7.0 | consuming ([myargus#296](https://github.com/deanjstone/myargus/issues/296)) |
| `myargus` | `apps/briefings` | v2.4.1 | consuming |
| `myargus` | `apps/shell` | v3.0.2 | consuming |
| `myargus` | `apps/stockade` | v2.7.0 | consuming ([myargus#295](https://github.com/deanjstone/myargus/issues/295)) |
| `slate-reader` | `apps/server` | v2.7.0 (vendored) | **LinkPill only**: `link-pill-core` and `link-pill-html` are copied in; no `@design-system` alias. The web UI is `apps/client` (Preact, no registry) ([slate-reader#17](https://github.com/deanjstone/slate-reader/issues/17)) |
| `budget` | `web` | none yet | **pending**: forked `components/ui`, no `components.json` ([budget#271](https://github.com/deanjstone/budget/issues/271)) |

Move a pending row to consuming only once a `components.json` with the alias
is on that repo's `main`.

## Structure

```
registry.json              root manifest — one entry per distributable item
registry/
  lib/utils.ts              re-exports cn() from the cn package
  lib/theme-preference.ts   theme + Light/Dark/System choice: cookie, localStorage, no-flash script
  lib/nav-link.tsx          renderAnchor and the renderLink type the layout blocks share
  lib/link-pill-*.ts, .css  LinkPill core, HTML shell and styles
  lib/highlighter.tsx       Shiki loader behind use-highlighted-code
  base-nova/ui/               45 base-nova style components (Base UI, plus link-pill)
  base-nova/hooks/            use-mobile (pulled by sidebar), use-highlighted-code (pulled by code-block), use-theme-preference
  base-nova/blocks/           v3 layout blocks: app-shell, app-switcher, page-header, empty-page, settings-page, login
  design-check/             scripts and workflow of the design-check item (CI, not UI)
  app-html-head/            iPhone <head> tags snippet (app-html-head item)
  links/                    links.json, its schema, links.sh and the link-check script and workflow (ADR-0004)
  lib/links-core.ts, links.ts  URL builders, and the module generated from links.json
r/                         generated per-item output — what the r/ alias resolves
theme/tokens.css            same tokens as the "theme" item, as plain CSS
theme/themes.json           the six T3 themes (light + dark) behind both; see DESIGN.md Themes
scripts/theme/              extract-t3.mjs reads T3's sheet; build.mjs writes tokens.css and registry.json
scripts/links/              registry.mjs validates links.json, generate.mjs writes lib/links.ts, cf-drift.mjs diffs Cloudflare
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

Components import `cn` from the `cn` package (`import { cn } from "cn"`),
which replaced `clsx` and `tailwind-merge` upstream in September 2026, and
declare it as a dependency (`cn@^0.5.0`, pinned to its minor because the
package is pre-1.0). Nothing in the registry depends on `clsx` or
`tailwind-merge` any more. The `utils` item stays and writes
`lib/utils.ts` as `export { cn } from "cn"`, so your own code that imports
`@/lib/utils` keeps working. Components no longer pull `utils` in, so adding
one leaves your `lib/utils.ts` alone.

**Moving a consumer that pinned an earlier tag:** pull items from this release,
then run upstream's migration, which moves the project from `clsx` and
`tailwind-merge` to `cn`:

```bash
npx shadcn@latest migrate cn
```

If your `lib/utils.ts` carries a custom `extendTailwindMerge` config, do not
re-pull `utils` over it; port the config to `cn/config` first (see the
[cn README](https://github.com/shadcn-ui/cn#custom-themes)).

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
patch, a `feat:` the minor, and a `BREAKING CHANGE:` footer the major. The
analyzer here (`conventional-changelog-angular` 8.3.1) does not read a `!` in
the subject, so a `feat!:` with no footer releases nothing; write both. Every release gets a `vX.Y.Z` tag, a GitHub release, and a CHANGELOG
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

**From the release that ships design-system#65, a tag pins its dependencies
too.** Every in-repo `registryDependencies` entry in a tagged `registry.json`
and `r/*.json` carries that tag's ref, for example
`deanjstone/design-system/button#v4.0.0`, so shadcn fetches each dependency
from the same tag as the item you named. shadcn does not carry a ref across
dependencies on its own: "Refs are not inherited across dependencies. If a
dependency should be pinned, include its own ref." ([GitHub
Registries](https://ui.shadcn.com/docs/registry/github), read 2026-10-08), so
the release writes the ref into each entry. `main` keeps the unversioned form
(`deanjstone/design-system/<name>`), so an unpinned install still floats.

**Older tags do not.** Before that release, a pin fixed only the item you
named: every `registryDependencies` entry was an unversioned address and
resolved from `main`. If you pin to an older tag, read the "In practice"
paragraph below. Entries from other registries are never stamped. Only `theme`,
`utils`, `use-mobile`, `highlighter`, `link-pill-core` and `link-pill-css` have no
registry dependencies. Almost every other item depends on at least `utils`.

**What the release does.** semantic-release's `prepare` step runs
`scripts/release/semantic-release-pin.mjs` after the release commit. It stamps
`#<tag>` into `registry.json`, rebuilds `r/` with `shadcn build`, fails the
release if any in-repo entry is left without exactly that ref, and commits the
result. The tag points at that commit. A second commit on `main` restores the
unversioned `registry.json` and `r/`, so `main`'s tree is the release commit's
tree. The tag stays reachable from `main`, which semantic-release needs to
find the last release. A commit cannot contain its own SHA, so the tag name is
the ref. Tags are immutable by convention, which is what makes that safe.

**When `main` moves during a release.** Direct pushes can land while a Release
run is in flight. The run starts from the tip of `main`, runs
`scripts/release/release-with-retry.sh`, and redoes the release up to 3 times if
semantic-release reports the branch is behind or a release push is rejected as
a non-fast-forward; each attempt first resets the checkout to `origin/main`.
Three failures fail the job with an `::error::` line. A rejection of the pin
plugin's last push, which comes after the release commit has reached `main`,
leaves a second release commit and a duplicate CHANGELOG section for the same
version after the redo; the tag and `r/` pin are still made once.
The `Registry output current` check runs on `main` and pull requests only, so
it never sees the stamped form.

**Option 1: a `#ref` on the item address (preferred).** shadcn 4.x accepts
a branch, tag or commit SHA after `#`:

```bash
npx shadcn add deanjstone/design-system/button#v3.0.0
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
      "url": "https://raw.githubusercontent.com/deanjstone/design-system/v3.0.0/r/{name}.json"
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
dependency upgrade. On a tag from the release that ships design-system#65 or
later, files pulled in as dependencies come from the same tag. A dependency
added to `main` after the tag is never installed by a tagged address. On an
older tag, dependencies come from `main`, and passing each one with its own
`#ref` in the same command does **not** work around that: the dependency's
`main` copy wins (see below). For a fully reproducible install from an older
tag, pin and add only leaf items (`theme`, `utils`, `use-mobile`), or inspect
the dependency files the CLI writes. A tooling script that reads
`registryDependencies` from a tagged build sees the `#ref` suffix.

Verified 2026-10-08 with `shadcn@4.21.4` against a tag from before the stamping
above, in a fresh Vite app with `init -b base -p nova`. Every `fetch` and `git` call the CLI made was logged
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

## LinkPill

Renders a Markdown link as a pill that shows what it points at. Four items,
no npm dependencies (see `GLOSSARY.md` for the terms and
[ADR-0003](docs/adr/0003-scheme-first-link-kind-detection.md) for how the
kind is detected):

| Item | Use it for |
|---|---|
| `link-pill-core` | `classify(href)`, per-kind attributes and the `Enricher` type. Pure and ES5-safe. |
| `link-pill-html` | `renderLinkPill(link, options) → string` for server-side renderers. Depends on the core only. |
| `link-pill` | The React shell: `LinkPill`, plus `LinkPillEnricherProvider`. |
| `link-pill-css` | The one stylesheet both shells use. Installs to `link-pill.css` at the project root (move it where you like) — import it once. |

```bash
npx shadcn add deanjstone/design-system/link-pill        # React
npx shadcn add deanjstone/design-system/link-pill-html   # HTML strings
```

```tsx
// React: use it as the Markdown renderer's anchor component.
<LinkPillEnricherProvider enrich={enrich}>
  <Markdown components={{ a: (props) => <LinkPill variant="chip" {...props} /> }} />
</LinkPillEnricherProvider>
```

```ts
// HTML, e.g. a marked renderer; `legacy: true` for Safari 9.
renderLinkPill({ href, label: text }, { variant: "inline", legacy: false })
```

- `variant` is `"inline"` (prose: glyph plus tinted underline, wraps) or
  `"chip"` (chat: tinted chip, label cut at about 24ch by CSS; the full label
  stays in the DOM as the accessible name and `title`).
- A pill renders at once from the href and link text. The optional
  **Enricher** (`(link) => Promise<{ label?, avatarUrl?, title? } | null>`)
  upgrades Mentions and URL Links afterwards; results are cached per href, and
  a `null` or a failure leaves the pill as rendered (a failure is logged with
  `console.error`). The HTML shell is synchronous, so it takes an
  already-resolved `enrichment` option instead.
- A chip is followed by a word joiner (U+2060) so the punctuation after it
  cannot be stranded on its own line.
- Hrefs of kind None render as an ordinary `<a>`. A `javascript:`, `data:` or
  `vbscript:` href, and the streaming placeholder `streamdown:incomplete-link`,
  render the label as text. The HTML shell escapes every label and attribute,
  but still sanitise its output after rendering.
- Link kinds that need allowlisting in a sanitiser: schemes `geo:` and
  `mention:`, plus the `link-pill*` classes, the `svg`, `path`, `img` and `span`
  elements and their `viewBox`, `d`, `aria-hidden` and `focusable` attributes.

## Agent-interface items

`trace`, `code-block` and `questionnaire` are shadcn's October 2026 agent-interface
components (see the [shadcn changelog](https://ui.shadcn.com/docs/changelog)),
in `base-nova` style with the upstream API unchanged. They complete the
Conversation set for an agent turn:

| Item | Use it for | Pulls in |
|---|---|---|
| `trace` | One line per agent step (reasoning, tool call, source, plan, subagent run), with `running`, `error` and `pending` states and nested, expandable detail | `collapsible`, `code-block` |
| `code-block` | Code, terminal output, logs and diffs: line numbers, wrap, highlighted lines, and `size="sm"` for tool output inside a `trace` | `button`, `use-highlighted-code` → `highlighter` (`shiki`) |
| `questionnaire` | Asks the person to clarify before the agent continues: single and multiple choice, freeform, skippable | `button`, `@shadcn/react@^0.3.1` |

```bash
npx shadcn add deanjstone/design-system/trace#v3.0.0
npx shadcn add deanjstone/design-system/code-block#v3.0.0
npx shadcn add deanjstone/design-system/questionnaire#v3.0.0
```

Syntax highlighting is optional and lives in `use-highlighted-code`; add
languages to the `languages` map in the copied `highlighter.tsx`. `trace`
declares `code-block` because a tool step's output belongs in one; it does not
import it. `shimmer` (the running title) and `scroll-fade-*` come from
`shadcn/tailwind.css`, which `shadcn init` already imports, as for
`attachment` and `message-scroller`.

**Consumers that should adopt them:** `argus` `apps/ops-hub-web`. Adoption is a follow-up issue per consumer, not part of
adding the items.

## Adding a new component

1. Add the source file(s) under `registry/base-nova/ui/` (or `registry/lib/`
   for non-UI code).
2. Add a matching entry to `registry.json` — `name`, `type`
   (`registry:ui` / `registry:lib` / `registry:hook`), `files`, and any
   `registryDependencies` / `dependencies`.

   A `registryDependencies` entry naming another item in this repo must use
   its full address, `deanjstone/design-system/<name>`. A bare name such as
   `button` means shadcn's built-in item, not ours, so the consumer silently
   gets upstream's copy (design-system#57). Write it without a ref: the
   release stamps `#<tag>` into tagged builds itself.

   Pin a pre-1.0 npm dependency to its minor, e.g. `@shadcn/react@^0.3.1`,
   so a re-run `shadcn add` cannot pull a breaking release.
3. Commit on a feature branch, open a PR — see `.claude/SYSTEM.md`.

## Themes

The `theme` item carries six themes (`default`, `t3-chat`, `grove`, `ocean`,
`ember`, `iris`), each in light and dark, selected by `data-theme` plus the
`dark` class; no attribute means Ocean. The `theme-preference` lib stores the
visitor's choice. Token map, selection rules and the pinned T3 source are in
[DESIGN.md](DESIGN.md#themes). After editing `theme/themes.json`, run
`pnpm build:theme` to regenerate `theme/tokens.css`, `registry.json` and `r/`.

## Migrating from v2 to v3

v3.0.0 changes how every app looks once its `theme` item is re-added, so it is
a major. The registry shipped most of it in v2.12.0 by accident (a `feat:`
merge subject); v3.0.0 adds the layout blocks and marks the break. Nothing
changes in an app until it re-runs `shadcn add` against `#v3.0.0`.

```bash
npx shadcn add deanjstone/design-system/theme#v3.0.0 -o
npx shadcn add deanjstone/design-system/app-shell#v3.0.0
```

| Area | v2 | v3 | What to do |
|---|---|---|---|
| Themes | One chroma-zero palette | Six themes (`default`, `t3-chat`, `grove`, `ocean`, `ember`, `iris`), each light and dark; no `data-theme` means **Ocean** | Set `data-theme` on `<html>` to keep another palette; `-o` overwrites files the CLI wrote earlier, so diff any hand edits first |
| Type scale | Tailwind's sizes | T3's scale: `text-xs` is 13px/17px (was 12px/16px), `text-xl` 21px, `text-2xl` 26px; `text-2xs` and `text-3xs` are new | Swap `text-xs` for `text-2xs` where the old 12px is wanted |
| Glass tokens | none | `--glass-surface`, `--glass-fallback`, `--glass-blur`, `--glass-opacity`, `--glass-saturation`; `surface-glass`, `dialog-glass`, `dropdown-glass` utilities | Nothing, unless you want the glass recipe |
| Theme preference | Per-app | `theme-preference` lib (cookie `ds-theme` on a configurable parent domain, `localStorage` fallback, no-flash `themeInitScript()`) and the `use-theme-preference` hook | Put `themeInitScript()` in `<head>` |
| Layout blocks | none | `app-shell`, `app-switcher`, `page-header`, `empty-page`, `settings-page`, `login`, plus the `nav-link` lib | Optional; add the ones you want |
| Radius | `0.625rem` | `0.625rem`, unchanged | Nothing |

Rules for the blocks and the full token map are in
[DESIGN.md](DESIGN.md#layout-blocks). A pin on a consumer's `@design-system`
alias stays where it is until its owner moves it.

## Tests

`pnpm install && pnpm test` renders registry sources in jsdom with Vitest
(`test/`); the `Test` workflow runs it on every PR. The dev dependencies
exist only for this — nothing here is built or published.

**Before a push: `pnpm check`.** It runs the three CI checks locally, in order:
`pnpm test`, the pinned impeccable detector over `registry/` and `theme/`, and
a `shadcn build` that fails if `r/` changed (or gained an untracked file).
Commit first, so `r/` is judged as it will be pushed. A pass prints one line,
`check: pass <short sha>`; paste it into the issue. A failure names the step
(`FAIL at step 3/3 ...`) and exits non-zero. A stale `r/` is fixed by
regenerating it (`npx shadcn@4.19.1 build --output ./r`) and committing the
result, never by hand-merging. No git hook runs it: it is a step you run, and CI
is the backstop. Its pins live in `scripts/check.sh`; `test/check-script.test.ts`
fails if they drift from `.github/workflows/design.yml` or `package.json`.

The browser-side geometry check is separate: `pnpm gate:geometry` (see
[Curve-geometry gate](#curve-geometry-gate)).

**Gotcha: Base UI parts with default children.** `Select.Icon`,
`Combobox.Icon` and `NavigationMenu.Icon` default their children to `▼`
(also `Combobox.ItemIndicator` `✔️`, `Combobox.Clear` `x`). `render` swaps
only the element, so the glyph lands inside whatever you render — a lucide
svg appends it as a stray text node. Give these parts an explicit child,
`{null}` if the rendered element supplies its own (design-system#50).

## Safe areas (iPhone)

The theme carries the safe-area foundation, so an app never hand-rolls an inset
([design-system#137](https://github.com/deanjstone/design-system/issues/137),
map [#136](https://github.com/deanjstone/design-system/issues/136)).

**The curve rule: backgrounds bleed, content never does.** A background, scrim
or image may run into the display's rounded corners, the Dynamic Island and the
home-indicator zone. Text and controls may not. Edge padding is
`max(<minimum>, env(safe-area-inset-*))`, and a control that hugs a corner gets
the extra `--corner-clear`.

| Token | Value | Use |
|---|---|---|
| `--safe-t` `--safe-r` `--safe-b` `--safe-l` | `env(safe-area-inset-*, 0px)` | The four device insets |
| `--gutter` | `1rem` | Edge padding every page wants |
| `--corner-clear` | `1.3rem` | Clearance for a control in a rounded corner |
| `--edge-x` / `--edge-x-end` | `max(var(--gutter), var(--safe-l \| --safe-r))` | Left and right edge padding |
| `--edge-b` | `max(0.5rem, calc(var(--safe-b) - 12px))` | Bottom edge: the home indicator sits about 12px below where content looks right |
| `--scroll-pad-top` `--scroll-pad-bottom` | `0px` | Set to the sticky header and fixed tab-bar heights; `html` uses them as `scroll-padding` so a focused control is not hidden (WCAG 2.4.11) |

| Utility | Does |
|---|---|
| `px-edge` | Left and right padding from `--edge-x` / `--edge-x-end`, so content clears the curves in landscape |
| `pb-edge` | Bottom padding clear of the home indicator |
| `inset-corner-br` | `right` and `bottom` for a fixed bottom-right control (a FAB): `max(--corner-clear, safe-r)` and `--edge-b`. Add `fixed` yourself |
| `min-h-app` | `min-height: 100dvh`, with `100vh` under `@supports not (min-height: 100dvh)`. Use it instead of `min-h-screen`, which is taller than the visible area on iOS Safari |
| `pt-safe` `pb-safe` | Unchanged. Right for a bar that must clear the status bar or home indicator |
| `pl-safe` `pr-safe` | Unchanged, but **not enough for content**: they resolve to `0` in Safari and in landscape on a device with no side inset, which is exactly where a display curve still clips text. Use `px-edge`. `design-check` fails them |

```tsx
<main className="min-h-app px-edge pb-edge">...</main>
<button className="fixed inset-corner-br size-14 rounded-full">+</button>
```

**`app-html-head`** puts the iPhone `<head>` tags in one place so apps stop
copying them by hand and drifting:

```bash
npx shadcn add deanjstone/design-system/app-html-head
```

It lands `app-html-head.html` at the project root; copy its tags into your
`index.html`. It sets `viewport-fit=cover` (without it every `env(safe-area-inset-*)`
is `0`), no zoom limit, the `apple-mobile-web-app-*` set with the `default` status
bar, and a light and a dark `theme-color` matching Ocean.

**Decisions recorded here:**
- `apple-mobile-web-app-capable` is included. iOS 26 opens every Home Screen site
  as a web app, so it matters only on older iOS; the status-bar style decides the
  top inset either way, and `default` keeps the bar opaque.
- The tap highlight (`-webkit-tap-highlight-color`) keeps the browser default.
  Components have no uniform `:active` style, so removing the highlight would
  leave a tap with no feedback; it is a check on the owner's iPhone
  ([#141](https://github.com/deanjstone/design-system/issues/141)).
- The shell keeps `overscroll-behavior: auto`, so the iOS rubber-band and
  pull-to-refresh still work in every consumer ([#148](https://github.com/deanjstone/design-system/issues/148),
  owner decision 1 Nov 2026). Only inner scrollers opt out with `overscroll-contain`
  (drawer, message-scroller). A consumer that wants a native-app feel sets
  `overscroll-behavior` on its own `html`.

### Overlays

Every overlay edge carries its own inset, so a consumer never adds `pb-safe` to a
sheet by hand ([design-system#140](https://github.com/deanjstone/design-system/issues/140)).

| Item | Edge | Inset |
|---|---|---|
| `sheet` | top; left and right | Top: `--safe-t`, `--safe-l`, `--safe-r`. Left and right: `--safe-t`, `--safe-b` and the outer-edge `--safe-l` or `--safe-r` |
| `sheet` | bottom | `max(var(--safe-b), 1rem)`, plus `--safe-l` / `--safe-r` |
| `sheet` close button | top, right | Offset by `--safe-t` / `--safe-r` as well, because an absolutely positioned control ignores the popup's padding |
| `dialog`, `alert-dialog` | all | Height capped at `100dvh - 2rem - 2 * max(safe-t, safe-b)` and scrolls; side margin is `max(1rem, safe-l, safe-r)`. The cap is symmetric because the dialog is centred |
| `dialog` header | right | `pr-10` when the close button shows, so a long title clears it |
| `drawer` | by swipe direction | `--safe-b` (down), `--safe-t` (up and any snap-point drawer), `--safe-l` / `--safe-r` on the sides |
| `sonner` | top, bottom | Default `offset` and `mobileOffset` of `calc(var(--safe-t) + 8px)` and `calc(var(--safe-b) + 8px)`. A consumer's own `offset` replaces them |

`DrawerContent` takes an opt-in `showCloseButton` (default `false`, so existing
drawers render as before). A swipe alone fails WCAG 2.5.7 and is unreachable for
VoiceOver, so turn it on for any drawer without another close control.

**Decisions recorded here:**
- Toast lifetime stays at sonner's 4s default. sonner has no per-type duration, so
  a longer error toast needs a wrapper around `toast.error`; pass `duration` on the
  `Toaster` for a longer default.
- The drawer takes the top inset whenever it has snap points, because the popup
  cannot tell its full-height snap from the half one. A half-snap drawer therefore
  has extra top padding on a notched device.
- A scrolled dialog scrolls its close button away with the content; Escape and the
  footer actions still close it.
- Sheet and drawer slides becoming fades under Reduce Motion is
  [#147](https://github.com/deanjstone/design-system/issues/147). Keyboard overlap
  for overlays is a device check in [#141](https://github.com/deanjstone/design-system/issues/141).

### Curve-geometry gate

`pnpm gate:geometry` proves, without an iPhone, that a UI change keeps text and
controls clear of the display curves, the Dynamic Island and the home-indicator
band ([design-system#143](https://github.com/deanjstone/design-system/issues/143)).
It builds a harness page of the registry blocks (AppShell, login, sheet on four
sides, dialog, alert dialog, drawer, toast), opens each in Playwright Chromium and
sets the insets with the CDP method `Emulation.setSafeAreaInsetsOverride`, so
`env(safe-area-inset-*)` resolves to the device values. Chromium draws no curves;
the gate measures instead.

| Scenario | Viewport | Insets T/B/L/R |
|---|---|---|
| all insets 0 (Safari tab) | 402×874 | 0/0/0/0 |
| iPhone 17 portrait | 402×874 | 62/34/0/0 |
| iPhone 17 portrait, status bar default | 402×812 | 0/34/0/0 (top curves out of view) |
| iPhone 17 landscape | 874×402 | 0/20/62/62 and 20/20/62/62 |
| iPhone Air portrait / landscape | 420×912 / 912×420 | 68/34/0/0 / 20/29/68/68 |

**What fails the gate.** Every control's rect and every text line's rect
(`Range.getClientRects`) must lie inside the display's rounded rect (radius 62,
which also satisfies the 55 of older phones), clear of the island box (125×37pt,
14pt from the top; both short edges in landscape) and above the home-indicator
band, and must not spill sideways. Backgrounds, borders and shadows are exempt, as
are text hidden for screen readers and anything a fixed bar covers. A page that
scrolls is measured at its top and at its end; each position holds the half of the
page at rest at that edge, and fixed or sticky chrome at both. The band starts
12px below the bottom inset line, because `--edge-b` is the inset less 12px by
design (the indicator sits about 12px below where content looks right).

**Also checked, in the same contexts.** Token contrast (the two vitest files, run
first); WCAG 2.5.8 target size (24px, hit area counted) at 402×874 and 874×402;
inputs at 16px or more; reduced motion (a `reducedMotion: "reduce"` context, then
`document.getAnimations()` for movement); glass-bar contrast (every theme and mode: each label on the AppShell header and tab bar is measured against the bar as painted, with the labels hidden and the pixels under them sampled, 4.5:1 for text and 3:1 for icons); an aria snapshot per block against
`scripts/geometry-gate/aria/`; a Tab loop whose focused control must not be under
something else; a 320px / 200% text reflow context; and axe `target-size` and
`scrollable-region-focusable`. A finding the #144 audit already filed sits in
`KNOWN` in `scripts/geometry-gate/checks.mjs`: it is reported with its issue and
does not fail the gate, and a `KNOWN` entry that stops firing fails it until the
entry is deleted, so the list only shrinks.

**Running it.**

```bash
pnpm gate:geometry                          # everything; exit 1 on a new finding
pnpm gate:geometry --scenario iphone-17-landscape-top-0 --view shell
pnpm gate:geometry --url http://localhost:5173/some/page   # a consumer's dev URL
pnpm gate:geometry --update-aria            # after an intended markup change
```

`--url` runs the geometry, target-size, font-size, axe and Tab checks on that one
page. It needs Chromium (`GATE_CHROMIUM=/path/to/chrome` if Playwright's is not
installed). Screenshots with the curve mask (red), island (black), band (amber) and
each offender outlined (magenta) are written to `geometry-gate-out/curves/`; a
failing run's files end in `__FAIL`. Attach them to the PR.

**What a pass does not prove.** Geometry only: no WebKit layout or rendering, no
real standalone status-bar style, no keyboard overlap and no dynamic viewport. The
corner radius is a circle standing in for the real curve, from community data. Those
are owner checks on the iPhone ([#141](https://github.com/deanjstone/design-system/issues/141)).
It is not part of `pnpm check` (no browser there), but CI runs it on every push to
`main` and on every pull request: the `Curve geometry gate` job in
`.github/workflows/test.yml`. A red run uploads the curve screenshots as the
`geometry-gate-curves` artifact. Run it locally before a change to a block's edges,
and `GATE_REGISTRY=<other checkout>/registry` points it at another tree.

**Chromium in CI is downloaded once.** The job sets `PLAYWRIGHT_BROWSERS_PATH` to
`$HOME/.cache/ms-playwright`, outside the workspace, then runs
`pnpm exec playwright-core install chromium`, which only downloads when the
`playwright-core` revision in `package.json` is missing. A self-hosted runner keeps
that directory on its host; a GitHub-hosted one restores it with `actions/cache`
keyed on the `playwright-core` version. Only a version bump downloads again. The job
never installs OS packages (no `--with-deps`, no sudo): a runner missing Chromium's
system libraries is an owner change.

## Links registry

Every myargus.cc and tailnet URL comes from one registry
([ADR-0004](docs/adr/0004-cross-repo-myargus-url-taxonomy.md),
[map #151](https://github.com/deanjstone/design-system/issues/151)). Five items:

| Item | Lands at | Is |
|---|---|---|
| `links-data` | `links.json` | Every host and app: bucket, status, host, path, routes, expected anonymous probe status, hosting, Access gating, the shared cookie domain. Edit it **here only**; bump `revision` on every change |
| `links` (+ `links-core`) | `@/lib/links.ts`, `@/lib/links-core.ts` | `appUrl(id)`, `routeUrl(id, path, params?)`, `apiUrl(id)`, `mcpUrl(id)`, `tailnetUrl(id)`, `switcherApps(currentId)`, `COOKIE_DOMAIN`. `links.ts` is **generated** from `links.json` |
| `links-sh` | `scripts/links.sh` | The same builders in bash with `jq`, for deploy scripts and hooks |
| `link-check` | `scripts/link-check.sh`, `scripts/link-check-config.mjs`, `.github/workflows/link-check.yml` | The literal ban, the config check and the drift check |

```bash
npx shadcn add deanjstone/design-system/links#v3.7.0
```

```ts
import { appUrl, routeUrl, apiUrl, COOKIE_DOMAIN } from "@/lib/links"

appUrl("reader")                                   // https://myargus.cc/reader/
routeUrl("shell", "/plans/:slug", { slug: "x" })   // https://myargus.cc/plans/x
apiUrl("watchtower-api")                           // https://api.myargus.cc/watchtower
appUrl("ops", { origin: process.env.OPS_ORIGIN })  // only the origin is overridable
```

```bash
bash scripts/links.sh url ops                      # https://ops.myargus.cc/
bash scripts/links.sh route shell /plans/:slug x   # https://myargus.cc/plans/x
bash scripts/links.sh --origin http://localhost:8787 api watchtower-api
```

Canonical forms: https only; app roots end in `/`; in-app routes and API/MCP
bases have none; builders join with one `/`. A retired entry throws, a redirect
entry builds its target, a planned entry builds. `routeUrl` throws for a route
`links.json` does not list: list a route there when another app links to it.
An MCP entry on a legacy host holds its live location and names the target in
`moveTo`, so one registry edit moves every consumer.

**link-check** runs from `scripts/link-check.sh [--mode report|block]` (default
`report`, or `LINK_CHECK_MODE`). Report mode prints each finding and one
`link-check: summary <repo> literals=N retired=M config=K drift=D` line and
exits 0: the baseline. Block mode exits 1 on any count above 0; flip the
workflow's `LINK_CHECK_MODE` to `block` when a repo reads 0. Counts are lines.

| Finding | Meaning |
|---|---|
| `literal` | A tracked line names the domain or the tailnet host. Exempt: markdown, test files and fixtures, lockfiles, changelogs, wrangler config, `_redirects`/`_headers`, files carrying the `link-check:vendored` marker in their first 10 lines, and globs in `.link-check-ignore` |
| `retired` | A literal that names a retired host (a subset of `literal`) |
| `config` | Vite `base`, router `basename`, manifest `start_url`/`scope`, a wrangler route or `_redirects` target that `links.json` does not hold. Textual, so it catches the common slips only |
| `drift` | The vendored `links.json` is behind design-system's, or differs at the same revision. An unreachable upstream is reported and passes |

**Cloudflare drift** (`scripts/links/cf-drift.mjs`, not a registry item) diffs
live DNS, tunnel ingress and Access apps against `links.json`. It makes GET
requests only:

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/links/cf-drift.mjs
```

The token needs Zone > DNS > Read, Zone > Zone > Read, Cloudflare Tunnel > Read
and Access: Apps and Policies > Read. Exit 0: no drift; 1: drift printed; 2:
could not run.

To change the registry: edit `registry/links/links.json`, bump `revision`, run
`node scripts/links/generate.mjs`, then `pnpm check`.

## Design check item

`design-check` puts [Impeccable's](https://impeccable.style) detector in a
consumer's CI as a non-blocking check, so every web interface gets the same
design-drift report. It is the check trialled in
[myargus#348](https://github.com/deanjstone/myargus/issues/348), shipped as a
`registry:file` item:

```bash
npx shadcn add deanjstone/design-system/design-check#v3.0.0
```

| Lands at | Does |
|---|---|
| `scripts/design-detect.sh` | Runs `impeccable@4.7.0 detect` on the UI files a PR changed (`.tsx`, `.jsx`, `.css`, `.html`, `.vue`, `.svelte`) and writes counts by rule and severity to the job summary |
| `scripts/design-rules.mjs` | The iPhone safe-area and touch rules below, on the same changed files. **A finding fails the job** |
| `.github/workflows/design-detect.yml` | Runs both on PRs that touch those files, `DESIGN.md`, `components.json` or `.impeccable/`. The detector step is `continue-on-error: true`, so a detector finding or a failed scan never blocks a merge; the rules step has no such flag |

**The design rules** (`design-rules.mjs`, [design-system#137](https://github.com/deanjstone/design-system/issues/137)):

| Rule | Fails |
|---|---|
| `viewport-height-unit` | `min-h-screen`, `h-screen`, `100vh` (the `100vh` fallback inside `@supports not (min-height: 100dvh)` passes) |
| `viewport-fit-cover` | a `<meta name="viewport">` without `viewport-fit=cover` |
| `fixed-without-safe-edge` | `fixed` / `position: fixed` with no `max(…env…)` edge, `inset-corner-*`, `*-edge` or `*-safe` utility. A full-bleed `inset-0` passes |
| `side-inset-without-floor` | `env(safe-area-inset-left\|right)` with no non-zero `max()` floor, and the `pl-safe`, `pr-safe` and `px-safe` utilities. A custom property that defines a token (`--safe-l: env(…)`) passes |
| `form-text-under-16` | an `input`, `textarea`, `select` (or the registry components of those names) with `text-sm`, `text-xs` or a pixel size under 16 at any breakpoint, such as `md:text-sm`: iOS zooms the page on focus |
| `focus-ring-alpha-only` | a focus indicator that is only `ring-ring/50` (under 3:1, WCAG 1.4.11); add a solid `outline` or `border-ring` |

The checks are textual (class strings and CSS declarations), so they catch the
common slips, not every case. A line that is right for a reason a rule cannot see
takes a `design-rules-ignore` comment on that line or the line above. Only files
the PR changed are scanned, so an old finding in an untouched file never fails a
PR.

- **Pinned, telemetry off.** The version is one variable in the script
  (`IMPECCABLE_VERSION`); a bump is a deliberate edit. `DO_NOT_TRACK=1` and
  `IMPECCABLE_NO_TELEMETRY=1` are exported. Nothing installs hooks or touches
  `~/.claude`; the detector runs from `npx`.
- **The registry-owned `ui` directory is skipped.** The script reads
  `aliases.ui` from every `components.json` in the repo (`@/components/ui`,
  `~/components/ui` or a bare path) and leaves that directory out, because
  `shadcn add` put those files there. A workspace-package alias
  (`@workspace/ui/components`) cannot be mapped to a directory; the summary says
  so, and the directory goes under `detector.ignoreFiles` in
  `.impeccable/config.json`, which the detector reads itself.
- **`DESIGN.md` is not shipped.** The detector's `design-system-color` and
  `design-system-font-size` rules read the `DESIGN.md` at the repo root (checked
  with 4.7.0: a copy in a subdirectory or beside the file turns them off).
  This repo's `DESIGN.md` describes the achromatic base that each app tints, so
  installing it would hold an app's own palette against ours and flag every
  tint as drift. A consumer without a root `DESIGN.md` gets the generic rules
  only; one with its own keeps it, and `shadcn add -o` cannot replace it. To
  start one, copy this repo's `DESIGN.md` and edit it to the app's identity.
- **Nor is `.impeccable/config.json`.** A consumer's detector ignores are its own.
- **`shadcn add` does not set the executable bit**, so the workflow runs
  `bash scripts/design-detect.sh`.

Needs `jq`, `npx` and `node`, all on GitHub-hosted runners. Rolling it out is a
follow-up issue per consumer.

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
  ring), plus `--radius`, `--card`, `--popover`, `--chart-1..5`, the status
  tokens `--success`/`--warning`/`--unreachable`/`--critical` (each with a
  `-foreground`; `badge` has a variant per role), and
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
- **45 components**, two hooks and the `highlighter` lib, all `base-nova` style and Base UI-based, pulled the same
  way as `theme`/`button` above:
  - *Controls* — `button`, `input`, `textarea`, `select`, `checkbox`,
    `switch`, `slider`, `label`
  - *Surfaces and overlays* — `card`, `dialog`, `alert-dialog`, `sheet`,
    `drawer`, `popover`, `dropdown-menu`, `collapsible`, `scroll-area`
  - *Display and feedback* — `badge`, `avatar`, `progress`, `skeleton`,
    `separator`, `tabs`, `table`, `sonner`, `spinner`, `empty`, `tooltip`
  - *Conversation* — `message`, `bubble`, `message-scroller`, `marker`,
    `attachment`
  - *Agent turns* — `trace`, `code-block`, `questionnaire` (see
    [Agent-interface items](#agent-interface-items))
  - *Navigation and lists* — `sidebar` (with the `use-mobile` hook), `item`,
    `breadcrumb`, `command`
  - *Forms and grouping* — `field`, `input-group`, `toggle`, `toggle-group`,
    `button-group`

  `tooltip` and `sidebar` need a `TooltipProvider` at the app root.
  `message-scroller` and `questionnaire` add the `@shadcn/react` package;
  `code-block` adds `shiki` (through `use-highlighted-code`); `command` adds `cmdk`.

  The set is bounded to what the consuming apps actually use — 45 of shadcn's
  ~65 — rather than shipping the full catalogue. Adding another is mechanical,
  so ask rather than vendoring a copy locally.
