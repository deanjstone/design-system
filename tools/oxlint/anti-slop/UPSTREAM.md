# Vendored anti-slop (4-rule subset)

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `13909c9e07590f5a85d93c62712259fe14a883f7` (plugin 0.1.2). Upstream has no npm package and says to vendor.

Licence: MIT, Copyright (c) 2026 Dillon Mulroy. `LICENSE` is retained verbatim.

Copied files (from `src/`, byte-identical to upstream):

- `rules/no-chained-type-assertions.ts`
- `rules/no-widen-then-assert.ts`
- `rules/no-conditional-empty-object-spread.ts`
- `rules/no-module-mocking.ts`
- `shared/scope.ts`

## Local adaptations

- `index.ts` is trimmed to register only these four rules; upstream registers 18. The other 14 rules and `effect/`, `vendor/eslint-stylistic/` are not vendored.

## Runtime dependency

`@oxlint/plugins`, root devDependency, pinned to the same version as `oxlint`.

## Updating

There is no update path. To bump, diff the five files against a new upstream revision, port the changes, and update the SHA here.

## Wiring

`oxlint.config.ts` at the repo root: three rules at `error`, `no-module-mocking` at `warn` for test files via `overrides`. This directory is in `ignorePatterns`.
