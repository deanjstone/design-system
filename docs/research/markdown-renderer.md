# Which markdown renderer serves streaming React chat and Safari 9 Preact notes?

Research for [design-system#73](https://github.com/deanjstone/design-system/issues/73) (map: [#71](https://github.com/deanjstone/design-system/issues/71)). Builds on [#72](https://github.com/deanjstone/design-system/issues/72): the pill is a framework-agnostic core (`classify(url)` → kind + attributes) with thin React and Preact shells. Date: 2026-10-10.

## Answer

**Use one renderer per surface. They share the pill core, not the parser.**

- **slate-reader notes: keep `marked`, on the server.** slate-reader already renders Markdown on the server, not on the iPad. `apps/server/src/library.ts` (origin/main, from slate-reader #14 `1e2b6d0`) runs `new Marked({ gfm: true })` and then `sanitize-html`, and the server returns an HTML fragment (`sendHtml`, `content-type: text/html`). The iPad never parses Markdown, so Safari 9 places no constraint on the renderer. That matters, because **`marked@18` cannot run on Safari 9 at all** (see below). The link hook is a `renderer.link` override that calls `classify(href)` and emits pill **HTML**. That makes it a third shell for the #72 core, an HTML-string shell beside the React and Preact ones. The `sanitize-html` allowlist must be widened, or the pill attributes are stripped.
- **myargus chat and knowledge: `streamdown`** (React only, 2.7.0). It is built for partial or unterminated LLM output, through `remend` and memoised per-block rendering. The link hook is `components={{ a: LinkPill }}`, which feeds the React shell from #72. It hardens links with `rehype-harden`. It is heavy, about 161 kB gzip, mostly `parse5` for raw HTML. If that is too much, use **`react-markdown` + `remark-gfm` + `remend`** at about 56 kB gzip. That gives the same `components.a` hook but no block memoisation.
- **Do not reuse `marked` client-side in myargus.** It only emits HTML strings, so a React pill would need `dangerouslySetInnerHTML` plus event delegation, with a full re-render on every token. It has no streaming repair of its own and no URL sanitiser of its own. Streamdown already uses `marked`'s lexer internally, but only to split the text into blocks.
- **If slate-reader ever needs client-side Markdown on the iPad**, the only candidates that passed the Safari 9 regex emulation are `markdown-it` (41.7 kB gzip) and `markdown-to-jsx` (28.5 kB gzip, its own sanitiser). Neither is needed today.

## Measurements (throwaway, `/tmp/mdr`)

Sizes come from bundling a one-import entry with esbuild 0.28.2: `--bundle --minify --format=esm`, react/react-dom external, then `gzip -9`. These are measured locally, not taken from bundlephobia.

| Package (version) | min | gzip | Link hook | Emits | Sanitisation | Streaming / partial |
|---|---|---|---|---|---|---|
| `marked` 18.1.0 | 46.2 kB | 14.0 kB | `renderer.link({ href, title, tokens })` returns a string (`lib/marked.d.ts` L202) | HTML string (or tokens via `Lexer`) | **None.** `javascript:` hrefs pass through. Pair it with sanitize-html or DOMPurify | None of its own |
| `markdown-it` 15.0.2 | 99.6 kB | 41.7 kB | `md.renderer.rules.link_open` (string), or walk `md.parse()` tokens to build vnodes yourself | HTML string / tokens | `html: false` by default; `validateLink` rejects `vbscript\|javascript\|file\|data:` (`BAD_PROTO_RE`, dist L3531) | None |
| `react-markdown` 10.1.0 | 123.0 kB | 38.2 kB | `components={{ a: Comp }}` | React elements via `hast-util-to-jsx-runtime` | No raw HTML unless `rehype-raw`; `defaultUrlTransform` allows only `https?\|ircs?\|mailto\|xmpp` (lib/index.js L124) | None |
| ... + `remark-gfm` 4.0.1 | 162.9 kB | 49.9 kB | same | same | same | None |
| ... + `remend` 1.4.0 | — | 55.8 kB | same | same | same | `remend` closes unterminated syntax |
| `streamdown` 2.7.0 | 535.3 kB | 161.0 kB | `components={{ a: Comp }}`; also `linkSafety: { enabled, onLinkCheck, renderModal }` | React only (peer `react ^18 \|\| ^19`) | `rehype-harden` + `rehype-sanitize`. `javascript:` was rendered as `x [blocked]` before reaching `components.a` (verified) | **Yes**: `remend`, `parseIncompleteMarkdown`, `isAnimating`, per-block memoisation |
| `markdown-to-jsx` 9.10.3 | 79.1 kB | 28.5 kB | `options.overrides.a` | React, Solid, Vue, HTML string, React Native; `createElement` override is documented "React/React Native/SolidJS/Vue only" (README L505) | Built-in URL `sanitizer` plus always-on raw-HTML attribute stripping (README "Raw HTML sanitization") | `optimizeForStreaming` hides incomplete structures (README "Streaming Markdown") |
| `remend` 1.4.0 (standalone) | 16.8 kB | 6.1 kB | n/a, it is a string pre-processor | Markdown string | n/a | Closes partial `**`, links, and so on. Works in front of any parser |
| `snarkdown` 2.0.0 | 2.1 kB | 1.1 kB | none (fixed output) | HTML string | none | none. Too thin: no tables or GFM |
| `dompurify` 3.4.16 (reference) | 30.5 kB | 11.9 kB | — | — | — | — |

Streamdown's weight, by package (minified): `parse5` 175 kB (pulled in by `rehype-raw`), streamdown 79 kB, `marked` 45 kB, `micromark-core-commonmark` 27 kB, `tailwind-merge` 27 kB, `property-information` 18 kB, `remend` 16 kB. Its classes are shadcn / Tailwind 4, which fits myargus (Tailwind 4, React 19).

## Safari 9 compatibility

Babel can lower syntax, and core-js can polyfill builtins, the `y` flag, `s`/dotAll and named groups (`es.regexp.constructor`). Three regex features cannot be fixed that way on Safari 9:

- **Lookbehind** `(?<=` / `(?<!`. Babel has no transform for it. A literal containing one is an early SyntaxError, which kills the whole legacy chunk.
- **`\p{…}` property escapes in `new RegExp` strings.** Babel's regexpu only rewrites regex *literals*.
- **The `u` flag passed at runtime.** Safari 9 has no `u` flag; it arrived in Safari 10.

Method: each candidate was bundled with a sample render, run through `@babel/preset-env` 8.0.7 with slate-reader's settings (`targets: ['ios_saf >= 9']`, `include: ['transform-template-literals']`, mirroring `apps/client/vite-plugins/es5-legacy-chunks.ts`), then scanned for remaining regex literals with those features. It was then executed in a `vm` context whose `RegExp` throws on lookbehind, `\p{}` or the `u` flag. **This is an emulation, not a real Safari 9.** slate-reader's `check:legacy` gate and the device are the final word.

| Candidate | After Babel | Result |
|---|---|---|
| `marked` 18 | Runtime `new RegExp(…, "u"/"gu")` with `\p{P}\p{S}` sources (e.g. `h(xe,"gu")`, emStrong delimiters). The lookbehind is feature-detected, which is fine | **Throws at module init.** Unusable on Safari 9 |
| `markdown-it` 15 | none | **Pass**, rendered the sample correctly (tables, strike, linkify) |
| `markdown-to-jsx` 9 | none | **Pass** (React target tested) |
| `react-markdown` (no gfm) | none | Pass |
| `remark-gfm` | Literal `/(?<=^\|\s\|\p{P}\|\p{S})([-.\w+]+)@…/gu` in `mdast-util-gfm-autolink-literal/lib/index.js` | **Fail.** Parse-time SyntaxError for the whole chunk |
| `streamdown` | `remark-gfm` lookbehind literal + `marked`'s runtime `u` regexes | **Fail** (and it is React-only anyway) |
| `remend`, `dompurify` | none | Pass |

A further, separate issue: the bundler and core-js emit ES2015 shorthand, which slate-reader's acorn `ecmaVersion: 5` gate rejects, as the #72 findings already noted (`transform-shorthand-properties`). Any client-side renderer on the iPad would hit that too.

## The link hook and the #72 core

`classify(url)` stays framework-free, and each surface wraps it:

| Surface | Hook | Shell |
|---|---|---|
| myargus chat and knowledge (streamdown / react-markdown) | `components.a = ({ href, children }) => <LinkPill href={href}>{children}</LinkPill>` | React shell (registry) |
| slate-reader notes (server `marked`) | `renderer: { link({ href, tokens }) { … classify(href) … return '<a href=… class="pill" data-pill-kind=…>' + this.parser.parseInline(tokens) + '</a>' } }` | **HTML-string shell** (new, server-side) |
| slate-reader Preact client | none for Markdown; the fragment arrives as HTML. If pills need behaviour, use one delegated listener on `a[data-pill-kind]` | Preact shell only for pills outside notes |

Verified in `/tmp/mdr/pill.mjs`: the `marked` override emits the pill markup. **slate-reader's current `sanitize-html` options strip it.** The default `allowedAttributes.a` is only `["href","name","target"]` (sanitize-html 2.18.0), so `class` and `data-*` are removed. The server config needs:

```ts
allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, a: ['href', 'name', 'target', 'data-pill-kind'], img: [...] },
allowedClasses: { a: ['pill'] },
```

`marked` itself left `javascript:alert(1)` in the href, and sanitize-html removed it, so the order must stay parse → sanitise. Better still, make `classify` reject non-http(s) schemes so the pill never renders for them.

The core therefore needs an **HTML-attribute output** (kind → `class` / `data-*` strings) as well as the React and Preact shells. That matches the #72 "per-kind class/attribute map". Class tokens for Tailwind 3 (slate-reader) and Tailwind 4 (myargus) differ, which is the separate tint/token ticket.

### Streaming gotcha (verified)

During streaming, Streamdown (via `remend`) completes a half-typed link as `[lin](streamdown:incomplete-link)` and passes that href to `components.a`. The pill shell must treat `streamdown:incomplete-link` as "pending": render plain text or a skeleton, and never call `classify` on it as a real URL. Otherwise each partial link flashes a wrong pill.

## Why not one renderer for both

- `marked` everywhere is the only "one parser" option that fits slate-reader's server today. In myargus, though, it would be a string renderer inside React. It has no streaming repair, needs DOMPurify on every token, and cannot host a React pill without delegation.
- `streamdown` and `react-markdown` + `remark-gfm` are React-oriented and fail the Safari 9 emulation. That is moot while slate-reader renders on the server.
- `markdown-to-jsx` is the only candidate that passes Safari 9, emits framework elements and does streaming. Its `createElement` override is documented for React, React Native, Solid and Vue, not Preact. It would replace a working server pipeline on slate-reader for no gain.

## Sources

- slate-reader origin/main: `apps/server/src/library.ts` (`Marked`, `sanitizeOptions`, `renderMarkdown`), `apps/server/src/server.ts` (`sendHtml`), `apps/server/package.json` (`marked ^18.1.0`, `sanitize-html ^2.18.0`), `apps/client/vite.config.ts` (`ios_saf >= 9`), `apps/client/vite-plugins/es5-legacy-chunks.ts`.
- Package sources as installed from npm: [marked](https://github.com/markedjs/marked) `lib/marked.esm.js`, `lib/marked.d.ts`; [markdown-it](https://github.com/markdown-it/markdown-it) `dist/markdown-it.mjs`; [react-markdown](https://github.com/remarkjs/react-markdown) `lib/index.js`; [mdast-util-gfm-autolink-literal](https://github.com/syntax-tree/mdast-util-gfm-autolink-literal) `lib/index.js`; [streamdown](https://github.com/vercel/streamdown) `README.md`, `dist/index.d.ts`, `package.json`; [markdown-to-jsx](https://github.com/quantizor/markdown-to-jsx) `README.md`; [sanitize-html](https://github.com/apostrophecms/sanitize-html) `defaults`.
- [caniuse: RegExp lookbehind](https://caniuse.com/js-regexp-lookbehind) (Safari 16.4+); [caniuse: Unicode property escapes](https://caniuse.com/mdn-javascript_regular_expressions_unicode_character_class_escape) (Safari 11.1+); [MDN: RegExp.prototype.unicode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/unicode) (Safari 10+); [core-js `es.regexp.constructor`](https://github.com/zloirock/core-js#ecmascript-regexp) (named groups, dotAll, sticky).
- [design-system#72 resolution](https://github.com/deanjstone/design-system/issues/72) and its [findings](https://github.com/deanjstone/design-system/blob/research/preact-compat-pill/docs/research/preact-compat-link-pill.md).
