# Can slate-reader's Preact legacy build consume a React registry component?

Research for [design-system#72](https://github.com/deanjstone/design-system/issues/72) (map: [#71](https://github.com/deanjstone/design-system/issues/71)). Date: 2026-10-10.

## Answer

**It can run, but it shouldn't be the shape.** A registry-style React pill (Base UI `useRender` + `mergeProps`, `cva`, `cn` = `clsx` + `tailwind-merge`) builds and renders under `preact/compat` through slate-reader's legacy pipeline. The cost is high, though: about **+29 kB gzip** of JS for the iPad 2 (legacy app chunk 7.3 → 22.1 kB, polyfills 23.9 → 37.6 kB). It also **breaks slate-reader's own ES5 gate** until the gate's lowering pass is widened, and the registry's class strings are **Tailwind v4 / OKLCH**, which slate-reader's Tailwind 3 cannot generate. A framework-agnostic core plus thin React and Preact shells costs **+0.2 kB gzip** and passes the gate unchanged.

**Recommendation:** make LinkPill a framework-agnostic core (link classification plus a per-kind class/attribute map, no React and no `tailwind-merge`) with thin `link-pill.tsx` (React, registry) and `link-pill.preact.tsx` (Preact) shells. The class-token mapping per Tailwind major belongs in the separate "pill tint → theme tokens" ticket.

## Build check (throwaway, `/tmp/pill-check`, a copy of `slate-reader` at `feature/ipad-dev-loop`)

Each variant was built with slate-reader's own `vite.config.ts`: `@preact/preset-vite`, `@vitejs/plugin-legacy` targeting `ios_saf >= 9`, and its `es5LegacyChunks` post-pass. Each was then gated with `scripts/check-legacy-es5.ts`. The registry deps were installed at the design-system's pinned ranges: `@base-ui/react@1.8.0`, `class-variance-authority@0.7.1`, `clsx@2.1.1`, `tailwind-merge@3.7.0`. Preact is 10.29.8.

| Variant | legacy app chunk (min / gzip) | legacy polyfills (min / gzip) | ES5 gate |
|---|---|---|---|
| A. baseline (current app) | 18.11 / 7.34 kB | 63.65 / 23.85 kB | pass |
| B. React registry pill via `preact/compat` | 65.02 / 22.07 kB | 101.69 / 37.60 kB | **fail**; pass after gate fix (below) |
| C. agnostic core + Preact shell | 18.52 / 7.53 kB | 63.65 / 23.85 kB (identical file) | pass |
| `preact/compat` alone (one `forwardRef`) | 26.05 / 10.18 kB | 70.71 / 26.22 kB | **fail** |

Legacy app-chunk bytes for B, attributed from source maps (minified, pre-ES5-pass): `tailwind-merge` 29.4 kB, `preact` (core + hooks + compat) 22.6 kB (baseline is 11.7 kB, so compat adds about 11 kB), `@base-ui/react` 3.0 kB, `@base-ui/utils` 1.6 kB, `class-variance-authority` 0.8 kB, `clsx` 0.4 kB.

B's polyfill growth: core-js usage detection added `web.url.constructor` and `web.url-search-params.*` (about 18 kB minified), plus `es.string.starts-with/ends-with/split/from-code-point`, `es.array.concat` and `es.iterator.filter/reduce`. The `URL` usage comes from Base UI's error-message formatter (`new URL(e); r.searchParams.set("code", …)` in `@base-ui/utils/formatErrorMessage`). Safari 9 already has `URL` ([caniuse: URL, Safari 7.1+, iOS 8+](https://caniuse.com/url)), so this weight is pure overhead for the target device.

### The ES5 gate failure

The gate fails because the bundler emits **ES2015 shorthand properties and methods** (`get(e){…}` from tailwind-merge's LRU cache, `{Map,set:…}` from minified core-js internals). `es5LegacyChunks` runs `@babel/preset-env` with `targets: ['ios_saf >= 9']`. Safari 9 parses shorthand, so Babel leaves it alone. `check-legacy-es5.ts` then parses with acorn `ecmaVersion: 5` and rejects it. `preact/compat` alone is enough to trigger this, through the polyfills chunk.

Fix verified in the scratch copy: add `'transform-shorthand-properties'` to the pass's `include`, next to `'transform-template-literals'`. This is a latent slate-reader issue: the same thing happens to any future dependency that pulls in a core-js helper. It is out of scope here; flag it to slate-reader if variant B is ever pursued.

### Runtime check

Variant B's **legacy** bundle was run in headless Chromium. The page's `type="module"` scripts were stripped and `nomodule` was removed so that the SystemJS legacy path executes (script: `/tmp/pill-legacy-run.mjs`). Results: legacy chunks loaded, no page errors, and three pills rendered with the correct `data-slot="link-pill"`, `data-kind` and merged classes. `tailwind-merge` resolved `px-2` vs `px-3` correctly, and the `render` prop worked. `preact/compat` reports `version = '18.3.1'` (`preact/compat/src/index.js`: "trick libraries to think we are react"), so Base UI takes its React-18 code paths (`@base-ui/utils/reactVersion`).

Limit: Chromium is not Safari 9. This proves the legacy bundle is functionally correct under compat. It does not prove Safari 9 has no runtime gaps. A scan of B's legacy chunk found no regex lookbehind or named groups, no `u`/`y` regex flags, and no `Proxy`, `Reflect`, `WeakRef`, `ResizeObserver`, `IntersectionObserver`, `structuredClone`, `AbortController` or `globalThis`. Only `Symbol.for` turned up, and Safari 9 has it (core-js polyfills it anyway). [speculation] No Safari 9 runtime blocker is evident for this small slice of Base UI; heavier primitives (Popover, Tooltip → floating-ui) were not checked.

## Why compat is the wrong shape even though it runs

1. **Bundle cost on the weakest device.** The iPad 2 gets the legacy bundle. B roughly triples the app chunk and adds about 14 kB gzip of polyfills, for a pill. About half of that is `tailwind-merge`, which only exists to let consumers override classes.
2. **Tailwind major mismatch.** Registry components are written for Tailwind v4: `@theme` in `theme/tokens.css`, 64 `oklch()` values in `registry.json`, and v4-only utilities in existing items (e.g. `badge.tsx`: `rounded-4xl`, `size-3!`, `has-data-[icon=inline-end]:pr-1.5`, `[a]:hover:`). slate-reader is on Tailwind 3. `tailwind-merge@3` "Supports Tailwind v4.0 up to v4.3 (if you use Tailwind v3, use tailwind-merge v2.6.0)" (tailwind-merge README, line 21, installed 3.7.0). So even a working compat import produces class strings that slate-reader's Tailwind 3 JIT won't generate correctly, and OKLCH has no Safari 9 support either (noted on map #71).
3. **ES5 gate churn.** Shown above: compat forces a change to slate-reader's legacy tooling.
4. **No benefit for a pill.** The only Base UI value used is `useRender`/`mergeProps` (the `render` prop and ref merging). A pill is an `<a>` with a class and data attributes, so the core does that in a few lines.

## Recommended shape

- `link-pill-core.ts`: `classify(href) → kind` and `pillAttributes(kind) → { className tokens, data-kind, data-slot }`. No framework, no `tailwind-merge`, ES5-safe (`indexOf` rather than `startsWith`, to avoid pulling polyfills).
- `link-pill.tsx`: the React registry shell. It can still use `useRender` + `cn` for myargus, which is on Tailwind v4.
- `link-pill.preact.tsx`: the Preact shell for slate-reader, with plain `class` concatenation.
- Per-Tailwind-major class tokens (v4 OKLCH vars vs a Tailwind 3 / Safari 9 fallback): open question, owned by the "pill tint → theme tokens" item on #71.
- Registry packaging for a Preact consumer (shadcn `registry:lib` + `registry:component` items, or a copy-in file): open question, owned by the "How the registry packages the pill" item on #71.

## Sources

- Preact, *Switching to Preact*: React libraries work through "our compatibility layer". Aliasing `react`/`react-dom` → `preact/compat` is "automatically handled for you by default" with `@preact/preset-vite`. "Some React libraries make use of types that may not be provided by preact/compat". <https://preactjs.com/guide/v10/switching-to-preact/>
- `@preact/preset-vite` README: `reactAliasesEnabled`, "Aliases react, react-dom to preact/compat", default `true`. <https://github.com/preactjs/preset-vite>
- Preact README (installed 10.29.8): "Supports all modern browsers and IE11".
- `@vitejs/plugin-legacy` README: legacy chunks are "transformed with @babel/preset-env and emitted as SystemJS modules", loaded through `<script nomodule>`. Polyfills come from "the target browser ranges and actual usage in the final bundle" (`useBuiltIns: 'usage'`). <https://github.com/vitejs/vite/tree/main/packages/plugin-legacy>
- caniuse, ES modules: iOS Safari ≤ 10.2 unsupported, so the iPad 2 always takes the legacy path. <https://caniuse.com/es6-module>
- caniuse, URL API: Safari 7.1+, iOS Safari 8+. <https://caniuse.com/url>
- tailwind-merge README (3.7.0): Tailwind v4 only; v3 users → 2.6.0. <https://github.com/dcastil/tailwind-merge>
- Base UI source (`@base-ui/react@1.8.0`): `internals/useRenderElement.mjs` and `@base-ui/utils/reactVersion.mjs` (React-version branching), `@base-ui/utils/formatErrorMessage` (`URL` usage).
- slate-reader `apps/client/vite.config.ts`, `vite-plugins/es5-legacy-chunks.ts`, `scripts/check-legacy-es5.ts` (read, not modified).
