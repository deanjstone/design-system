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
  new-york/ui/                new-york style components:
    button.tsx, card.tsx, label.tsx, input.tsx, dialog.tsx, tabs.tsx, badge.tsx
theme/tokens.css            same tokens as the "theme" item, as plain CSS
```

## Consuming this registry from another project

Pull items straight from GitHub with the CLI — no `components.json` config
needed:

```bash
npx shadcn add deanjstone/design-system/theme
npx shadcn add deanjstone/design-system/button
```

This uses shadcn's native GitHub-registry support: any public repo with a
root `registry.json` is installable directly via `<owner>/<repo>/<item>`.

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

## Versioning

Consumers pin the registry URL to a branch, tag, or commit SHA (swap `main`
above for a tag once this stabilizes). Breaking token or variant changes
should land as a tagged release so existing consumers aren't silently
broken by an `add` re-run.

## Adding a new component

1. Add the source file(s) under `registry/new-york/ui/` (or `registry/lib/`
   for non-UI code).
2. Add a matching entry to `registry.json` — `name`, `type`
   (`registry:ui` / `registry:lib` / `registry:hook`), `files`, and any
   `registryDependencies` / `dependencies`.
3. Commit on a feature branch, open a PR — see `.claude/SYSTEM.md`.

## Style

- `new-york` shadcn style, OKLCH color tokens, Tailwind v4 (`@theme inline`,
  no `tailwind.config.js`).
- Radix UI primitives under the hood; components are copied, not installed
  as a dependency — once pulled into a consumer, edit them there.
- The `theme` item ships the full token set: core colors (background,
  foreground, primary/secondary/accent/muted, destructive, border/input/
  ring), plus `--radius`, `--card`, `--popover`, and `--chart-1..5`.
- Available components: `button`, `card`, `label`, `input`, `dialog`,
  `tabs`, `badge` — all `new-york` style, Radix-based, pulled from the
  registry the same way as `theme`/`button` above.
