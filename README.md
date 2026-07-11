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
  new-york/ui/button.tsx     first pilot component, new-york style
theme/tokens.css            same tokens as the "theme" item, as plain CSS
```

## Consuming this registry from another project

In the consumer's `components.json`, add this repo under `registries`:

```json
{
  "registries": {
    "@design-system": "https://raw.githubusercontent.com/deanjstone/design-system/main/registry.json"
  }
}
```

Then pull items with the CLI:

```bash
npx shadcn add @design-system/theme
npx shadcn add @design-system/button
```

The CLI writes files into the consumer's own `aliases.ui` / `aliases.lib`
paths — components become that project's code, editable locally like any
other shadcn component. Updates are pulled explicitly, not auto-synced.

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
