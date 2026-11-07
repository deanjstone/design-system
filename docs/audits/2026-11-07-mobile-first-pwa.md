# Mobile-first PWA audit: design-system defaults and deployed apps

Date: 2026-11-07 (run 18:40–19:00 AEDT). Author: Aquila (WSL2). Owner-requested analysis.
Reference guide: a "Mobile-first PWA frontend design" chat export (28 KB HTML, read in full).
Scope: design-system at `af976fe` (`main`, v3.18.0), and the consuming apps at `origin/deploy` plus whatever live hosts were reachable.

## Verdict

The registry is **already ahead of the guide on the hard parts**: safe-area tokens, 44px coarse-pointer floor, 16px inputs, hover guards, Dynamic Type, a bottom tab-bar shell. Evidence below. The failures are in three other places:

1. **The defaults are desktop-dense and mobile is patched on top.** Markup says `h-8`; an unlayered `@media (pointer: coarse)` block overrides it. Any component not on the override list stays 32px or smaller on a phone.
2. **Adoption has drifted.** Zero of 12 consumer surfaces ship the Dynamic Type probe or rule. Three consumers sit on v3.1.0 and lack the `--safe-*` tokens the shell needs. Six of 12 have no service worker (a seventh has a push-only one) and five have no manifest.
3. **The registry ships no PWA scaffolding.** Four unrelated service workers exist; none is shared. Nothing handles the keyboard. Nothing offers install or update prompts.

## 1. Checklist extracted from the guide

| # | Principle (guide section) | Check |
|---|---|---|
| C1 | Safe areas: `env(safe-area-inset-*)`, island, curves, home indicator (§3) | tokens, shell, overlays |
| C2 | Dynamic viewport; test Safari tab **and** installed PWA (§3, §1.7) | `dvh` use; test matrix |
| C3 | Virtual keyboard: fixed bars and composers via VisualViewport (§1.4, §3) | keyboard handling |
| C4 | Thumb-reachable bottom tab nav, full-screen detail views, back, slide transitions, modal sheets (§3) | shell, overlays |
| C5 | Touch: ≥44×44, spacing, swipe, press feedback (§3, §5) | per-component sizes |
| C6 | Typography legible at device size; 393×852 reference, test smaller and larger (§5) | type scale, input size, gate viewports |
| C7 | PWA config: manifest, icons, splash, offline, service-worker updates, install (§1.5, §5.6) | per app |
| C8 | Component states: loading, empty, error, disabled, selected, active (§3.5) | per component |
| C9 | Shared foundation vs app identity; tokens as CSS custom properties; DESIGN.md (§4, §6) | structure |
| C10 | Natural scrolling, adapts to iPad and desktop (§5) | overscroll, layout |
| C11 | Framework-independent design system (§6) | stack |

Note on C11: the guide asks for framework independence. This registry is React and Base UI by decision (ADR-0001). The token layer (`theme/tokens.css`) is plain CSS and already portable. I don't recommend chasing more.

### 1b. Referenced sources (read after the first pass)

The first pass used the guide alone. These were read afterwards (fetched 2026-11-07, README level only; linked docs such as Homeframe's `SPEC.md` were not opened):

| Source | What it states | Effect on this audit |
|---|---|---|
| [Homeframe](https://github.com/BuiltByTed/homeframe) | Exposes geometry as hooks: `useKeyboard()` (`opening/open/closing/closed`), `useSafeArea()`, `useDisplayMode()` (browser / standalone / fullscreen). `ViewportDock keyboard="avoid"` follows `visualViewport` frame by frame and drops the home-indicator inset while the keyboard is up. Update flow: `reload: 'safe-point'`, `useServiceWorker()`, `useHomeframeUpdate()`. Install: `useInstallCapability()` with manual Share → Add to Home Screen copy and `nudges.install { minSessions: 2, minEngagedMs: 30000 }`. | Confirms R5 and R3 are real gaps, not taste. **Changes R5** to hooks plus a dock component, not only a viewport meta tag. **Changes R3** to include a safe-point reload and an engagement-gated install nudge. It does not state `interactive-widget`, so that part of R5 remains unverified. |
| [ios-pwa-scrolling-fix](https://github.com/gavalierm/ios-pwa-scrolling-fix) | **HTTP 404** at the URL in the guide. | Not read. The keyboard-layout claim in R5 has no second source beyond Homeframe. |
| [DESIGN.md spec](https://github.com/google-labs-code/design.md) | Front-matter keys `version, name, description, omitted, colors, typography, rounded, spacing, components`; component props `backgroundColor, textColor, typography, rounded, padding, size, height, width`. Only automated rule found: `contrast-ratio` (AA 4.5:1). No touch-target or safe-area keys; unknown props are accepted with a warning. | Our `DESIGN.md` already follows the format. The format cannot carry a 44px floor or safe-area rule, so those stay in `tokens.css` and the gate. **Adds to R2:** record `--control-h` in front matter as an unknown prop only if the warning is acceptable; otherwise leave it in CSS. |
| [Impeccable](https://github.com/pbakaus/impeccable) | `critique`, `audit` (a11y, performance, theming, responsive), `adapt`; a 62-rule deterministic detector, run in this repo by `pnpm check`. The README names no touch-target or safe-area rule. | The detector is already in CI here, so it gives no new signal for sizing. Rule list not enumerated; `npx impeccable detect --list-rules` would show whether any rule covers hit areas. |

Not read at all: Framework7, Ionic, PWABuilder, Apple HIG, web.dev and MDN pages, Mobbin and the other inspiration sites. The guide uses them as inspiration, and none was needed to test a registry's behaviour. HIG is the one worth opening if the 44px figure is ever challenged.

## 2. design-system component defaults

Method: read source, not names. Sizes are from class strings; px values are Tailwind steps. "Computed" means derived from classes, not measured in a browser.

### 2.1 Scorecard against the checklist

| Check | Result | Evidence |
|---|---|---|
| C1 safe areas | **Strong** | `--safe-t/r/b/l`, `--edge-x`, `--edge-b` at `theme/tokens.css:190-206`; `pt-safe`…`pr-safe` at `:1067-1080`; sheet pads each side `registry/base-nova/ui/sheet.tsx:66`; dialog max size subtracts insets `ui/dialog.tsx:57`; toast offsets `ui/sonner.tsx:7-12`; login `blocks/login.tsx:81` |
| C2 dynamic viewport | **Strong** (browser) / **untested** (standalone) | `100dvh` in dialog, drawer, shell, `min-h-app` (`tokens.css:1108`). Only sidebar still uses `svh` (`ui/sidebar.tsx:141`). No standalone-mode test exists anywhere |
| C3 keyboard | **Absent** | `grep -r "visualViewport\|interactive-widget\|virtualkeyboard" registry theme` returns nothing |
| C4 navigation | **Strong, one gap** | Floating bottom tab bar, 4 tabs plus More (`blocks/app-shell.tsx:57,433`), header back button, focus mode (`chrome="none"`), `banner` slot, auto-hide header. **Gap:** Dialog is a centred modal on phones (`ui/dialog.tsx:57`); no menu or select becomes a sheet. `page-transition` exists but is unlisted (staged) |
| C5 touch | **Good by override, weak by default** | See 2.2 and 2.3 |
| C6 type | **Strong** | Inputs `text-[max(1rem,16px)]` (`ui/input.tsx:12`, `ui/textarea.tsx:10`); iOS Larger Text via `--dt-scale` (`tokens.css:1124-1132`). Gap: `native-select` and `input-otp` are `text-sm` |
| C7 PWA | **Missing from registry** | `app-html-head` is head tags only. No manifest template, service worker, update or install hook, offline UI |
| C8 states | Good | `focus-visible` rings on all controls, `disabled:` and `aria-invalid:` styles, `skeleton`, `spinner`, `empty`, `alert`; hover guarded by `@media (hover: hover)` (`tokens.css:794`). Active is only `translate-y-px` on Button (`ui/button.tsx`) |
| C9 foundation | **Strong** | Themes, tokens, `DESIGN.md`, glossary, ADRs |
| C10 scrolling | Partial | `overscroll-contain` on scrollers and drawers only. No global `overscroll-behavior`, `touch-action: manipulation` or tap-highlight rule (`grep` in `tokens.css` finds none) |

### 2.2 Default sizes (source) versus what a phone gets

| Component | Source default | Coarse pointer (phone) | Verdict |
|---|---|---|---|
| Button `default` / `icon` | `h-8` / `size-8` (`ui/button.tsx:23,28`); `xs` `h-6`, `sm` `h-7`, `lg` `h-9` | `min-height/width: 44px` for every `[data-slot=button]` (`tokens.css:995-999`) | OK on phone, but every size variant collapses to 44px, so `xs` and `sm` are meaningless there |
| Input / select trigger / command input | `h-8` (`ui/input.tsx:12`) | `min-height: 44px` (`:1003-1006`) | OK |
| Tabs | list `h-8`, trigger floor 44 (`tokens.css:1012-1019`) | list 50px | OK |
| Toggle, dialog close | 32px | 44px (`:1008-1010,1021-1024`) | OK |
| Checkbox 16px, Switch 32×18px | drawn small | `::after` tap region ≥44 (`:1032-1049`) | OK |
| Badge (link or button only) | `min-h-5` | tap region 44 | OK |
| **Native select** | `h-8`, `text-sm` 14px (`ui/native-select.tsx:27`) | **no rule; stays 32px; 14px triggers iOS zoom-on-focus** | **Fail** |
| **Radio item** | `size-4` (16px) | **no tap region** (slot `radio-group-item` not listed) | **Fail** |
| **OTP slot** | `size-8`, `text-sm` (`ui/input-otp.tsx:58`) | **no rule; 32px cells, 14px text** | **Fail** |
| **Pagination link** | `size-8` (`ui/pagination.tsx:55-58`, slot `pagination-link`, not `button`) | **no rule** | **Fail** |
| **Slider thumb** | `size-3` (12px) (`ui/slider.tsx:41`) | **no tap region** | **Fail** |
| Combobox input and trigger, input-group control | `h-8` (`ui/combobox.tsx`, `ui/input-group.tsx`) | `command` has its own `pointer-coarse:h-11!` (`ui/command.tsx:75`); combobox and input-group do not | **Fail** (not browser-confirmed) |
| Accordion trigger | `py-2.5 text-sm` ≈ 40px computed | no rule | Marginal |
| Sidebar menu button | `h-8` (`ui/sidebar.tsx`) | phone gets the sheet sidebar, no floor | Marginal |
| Menu, context-menu, select, combobox items | `px-1.5 py-1 text-sm` (`ui/dropdown-menu.tsx:119`) ≈ **28px computed** | exempt | **Doc claims 36px rows (`DESIGN.md`); computed is 28px. Verify in a browser** |
| Dialog | centred, `p-4`, `sm:max-w-sm` | same | Not a phone-native pattern |
| Sheet `side=bottom` | exists, safe-area padded (`ui/sheet.tsx:66`) | same | Good, but opt-in |
| Drawer (Base UI) | swipe, snap points, `100dvh` (`ui/drawer.tsx:77,136`) | same | Good, but opt-in |

### 2.3 Documentation drift

- `theme/tokens.css:981` and `DESIGN.md` ("Adapting to input" section) say the canonical height is **36px**. The components and the `DESIGN.md` front matter say **32px**. One of them is wrong; the code says 32.
- `DESIGN.md` claims 36px menu rows; the classes compute to 28px.

### 2.4 Browser evidence for the override

Same page, same build, `https://stockade.myargus.cc/` login:

| Context | Input height | Input font |
|---|---|---|
| Phone, 390×844, touch (`pointer: coarse`) | 44px | 16px |
| Desktop, 1280×800 | **32px** | **14px** |

So the system works exactly as designed. The point is that the 44px is a patch over 32px, and only the listed slots get it.

## 3. Deployed apps

Method: a Playwright 1.61.1 Chromium context, one page at a time, closed after each. Phone: 390×844 at 3× DPR, touch, iPhone user agent. Desktop: 1280×800. Offline test: reload after load with the network cut. Available memory was checked before each run (2177, 2087, 2035, 1956 MB across the four phone runs; the last started just under the 2000 MB floor, so I stopped there and ran only two desktop passes after it recovered to 2125 and 2018).

**Not done:** Lighthouse (not installed; not worth the memory). Real Safari / installed-PWA behaviour (WebKit cached but not driven; a standalone-mode check needs a device). Anything behind a login. **All numbers below are Chromium emulation, not iOS.**

### 3.1 Live results (phone, 390×844)

| Host | Reached | Manifest | Service worker | Offline reload | Touch targets <44px | Notes |
|---|---|---|---|---|---|---|
| `myargus.cc` (shell) | `/signin` | yes, `display: standalone`, 192/512/any icons | **none** | **fails** (`ERR_INTERNET_DISCONNECTED`) | 0 of 2 | FCP 1520 ms, 343 KB |
| `knowledge.myargus.cc` | `/signin` | yes, 1 icon `any maskable` | yes, activated | **ok** (200, shell served) | 0 of 1 | FCP 1516 ms, 553 KB. `goto(networkidle)` timed out at 30 s though the page was up: something keeps the network busy; not diagnosed |
| `stockade.myargus.cc` | login | yes, `portrait`, dark theme colour | yes, activated | **ok** | 1 of 5: link "myargus settings" 107×18 | FCP 624 ms, 367 KB. Inputs 44px / 16px, `autocomplete="username webauthn"`, `enterkeyhint` set |
| `watchtower.myargus.cc` | login | **none** | **none** | **fails** | 0 of 3 | No `apple-touch-icon`. FCP 468 ms |
| `budget.myargus.cc` | marketing landing, no login needed | **none** | **none** | **fails** | **16 of 18** (period toggles 57×20, nav link 166×28, CTA text link 146×20) | viewport lacks `viewport-fit=cover`, no theme-color, no apple tags. **10.3 MB transferred**, FCP 1988 ms; JS is only 710 KB, so images dominate |
| Desktop: stockade, budget | same | | | | stockade 5 of 5 under 44, budget 19 of 21 | No horizontal scroll anywhere |

No horizontal overflow on any phone page. `html` font-size was 16px and `--dt-scale` unset on every host (Chromium, so expected; see 3.3 for the source-side finding).

Screens: [stockade login](screens/2026-11-07-stockade-390x844.png) (clean, 44px fields, full-width 44px buttons, centred card) and [budget landing](screens/2026-11-07-budget-390x844.png) (large, readable hero; the small period toggles sit below the fold).

### 3.2 Not reachable live: source analysed at `origin/deploy`

| Host | Why | Source |
|---|---|---|
| `atto1.myargus.cc`, `mail.myargus.cc`, `ops.myargus.cc` | Cloudflare Access login (302 to `curly-haze-c4d7.cloudflareaccess.com`) | below |
| `reader`, `briefings`, `jobs` | no resolving host found (`reader.myargus.cc` fails to connect; `read.myargus.cc` serves Stockade's title) | below |
| `quick-capture` (:3850), `scan-app` | tailnet only | below |
| Authenticated screens of every app | login wall | the shell is shared, so source is representative |

### 3.3 Source matrix (`origin/deploy`)

| App | Pin | `viewport-fit` | Apple tags | Manifest | Service worker | AppShell | Dynamic Type probe | `--safe-*` tokens |
|---|---|---|---|---|---|---|---|---|
| myargus/shell | v3.18.0 | yes | yes | yes | **no** | yes | **no** | yes |
| myargus/knowledge | v3.18.0 | yes | yes | yes | yes (`public/sw.js`, 50 lines) | yes | **no** | yes |
| myargus/briefings | v3.18.0 | yes | yes | **no** | **no** | yes | **no** | yes |
| myargus/jobs | v3.18.0 | yes | yes | **no** | **no** | yes | **no** | yes |
| myargus/reader | v3.18.0 | yes | yes | injected by `vite-plugin-pwa` | plugin, `autoUpdate` | yes | **no** | yes |
| myargus/stockade | v3.18.0 | yes | yes | injected (live-confirmed) | plugin (live-confirmed) | yes | **no** | yes |
| argus/email | v3.18.0 | yes | yes | yes | **push only**, no fetch handler (`sw.js`, 41 lines) | yes | **no** | yes |
| argus/ops-hub-web | v3.18.0 | yes | yes | yes | yes (120 lines, push + shell cache) | yes | **no** | yes |
| argus/watchtower | v3.18.0 | yes | yes | **no** | **no** | yes | **no** | yes |
| homelab/scan-app/web | **v3.1.0** | yes | yes | **no** | **no** | yes (2 refs) | **no** | **no** |
| quick-capture/web | **v3.1.0** | yes | yes | yes | yes (26 lines, navigate-only offline page) | no | **no** | **no** |
| atto1 | **v3.1.0** | **no** | **no** | **no** | **no** | no | **no** | **no** |
| budget/web | none | **no** | **no** | **no** | **no** | no | **no** | **no** |
| slate-reader | none; LinkPill vendored | n/a (Preact, own PWA, not audited here) | | | | | | |

Facts behind the table:
- `git grep -E "apple-system-body|--dt-scale"` over `origin/main` and `origin/deploy` of myargus, atto1, quick-capture, argus and homelab finds **no consumer file** outside the registry output. Dynamic Type (design-system#150, #163) has shipped to no app, though the theme rule and head script exist. The status-bar script **did** run on the live shell, knowledge, stockade and watchtower (a single unscoped `theme-color` after load), so those apps copied part of the snippet.
- `pointer: coarse` appears in every consumer's CSS, so the 44px floor reached all of them.
- Service workers: knowledge (cache-first plus navigate fallback), ops-hub-web (shell cache, push), quick-capture (offline page), email (push only), reader and stockade (Workbox). Five different shapes, no shared source.
- `AppShell` is used in 10 of the 12 consumer surfaces; the two without it are atto1 and quick-capture. budget and slate-reader are not consumers yet.

## 4. Recommendations, ranked by impact

Effort: S under half a day, M 1–2 days, L 3–5 days. "Bold" items are marked.

### R1. Close the coarse-floor gaps (S, do first)
Add `native-select`, `radio-group-item`, `input-otp-slot`, `pagination-link`, `slider-thumb`, `combobox-*` and `input-group-control` to the coarse block, with the same 44px floor or `::after` tap region. Make `native-select` and `input-otp` use `text-[max(1rem,16px)] pointer-fine:text-sm` like `input`.
- Before: a native `<select>` on iPhone is 32px tall and zooms the page on focus; a radio is a 16px target.
- After: every focusable control meets 44px and no field zooms.
- Add each slot to `scripts/geometry-gate` so it cannot regress. Correct the 36px claims (§2.3) in the same commit.

### R2. **Bold: invert the defaults, make touch the base and desktop the opt-down** (M)
Introduce `--control-h: 2.75rem` with `@media (pointer: fine) { --control-h: 2rem }` and have Button, Input, Select, Tabs, Toggle, Combobox, Native select and Input group use `h-(--control-h)` (and `size-(--control-h)` for icons).
- Before: `default: "h-8 …"` plus an unlayered `min-height: 44px` override that wins by cascade accident (`tokens.css:995`).
- After: `default: "h-(--control-h) …"`. The override block shrinks to the tap-region rules for checkbox, switch and badge; `xs`, `sm`, `lg` become real steps (`--control-h-sm`, `-lg`) instead of being flattened to 44px on phones.
- Why: R1 is a patch list that will keep growing. A single token means a new component is mobile-correct without anyone remembering a slot name. Phone and desktop render the same as today, so it ships as a minor, with the geometry gate as the proof.

### R3. **Bold: a `pwa-scaffold` registry item** (L)
One item, replacing five hand-rolled service workers and the hand-copied head snippet:
- `sw.ts` template: versioned shell precache, navigate fallback to cached shell plus `offline.html`, stale-while-revalidate for static assets, never cache API, optional push handlers (lift from `argus/apps/ops-hub-web/public/sw.js`).
- `use-sw-update` (a "new version, reload" banner through AppShell's `banner` slot) and `use-install-prompt` (Android `beforeinstallprompt`; iOS "Share → Add to Home Screen" hint).
- `manifest.webmanifest` generator from theme tokens (`theme_color`, `background_color`, icons incl. maskable, `orientation`, `shortcuts`).
- `use-sw-update` reloads at a safe point (not mid-form), as Homeframe's `reload: 'safe-point'` does; `use-install-prompt` waits for engagement (Homeframe: 2 sessions, 30 s) before nudging.
- Wire `app-html-head` into it so the probe and the status-bar script ship together.
- Before (live): shell, watchtower and budget fail an offline reload; email has a worker that can't serve offline. After: every app installs and opens offline with an update path.

### R4. Fix adoption drift with a check, not a reminder (M)
Extend `design-check` (already CI for consumers) to fail when an app's `index.html` lacks `viewport-fit=cover`, the manifest link, `apple-touch-icon`, or the Dynamic Type probe, or when its `components.json` pin is more than N minors behind. Re-pull the theme in the three v3.1.0 consumers (atto1, quick-capture, scan-app) so they gain `--safe-*`.
- Evidence: 0 of 12 have the Dynamic Type probe; 3 of 12 are 17 minors behind.
- Effort is M because bumping three consumers touches three repos, which each need their own ticket.

### R5. Keyboard-safe bars and a `Composer` block (M, device check required)
Ship hooks in the style Homeframe uses (§1b): `use-keyboard` (`opening/open/closing/closed`), `use-safe-area`, `use-display-mode`, publishing `--kb-inset`; a `Composer` block (input plus send, sits above the tab bar, rides the keyboard, drops the home-indicator padding while the keyboard is up). `message-scroller`, `message` and `bubble` exist but there's no composer to pair with them. Try `interactive-widget=resizes-content` in `app-html-head` as the first, cheapest fix.
- Status: **[unverified]**. I could not test iOS keyboard behaviour here. Homeframe confirms the problem class and the hook approach; its README does not mention `interactive-widget`, and the second reference (ios-pwa-scrolling-fix) 404s. The registry has zero handling. Treat as a hypothesis until checked on a device.

### R6. **Bold: phone-native overlays by default** (L)
`ResponsiveDialog`, `ResponsiveMenu`, `ResponsiveSelect` blocks that render as a Drawer or bottom Sheet on `pointer: coarse` and as a Dialog, Popover or Select on fine pointers. Make them the documented default; keep the raw primitives for edge cases.
- Before: a 28px-row dropdown anchored to a 44px button on a phone; a centred Dialog.
- After: bottom sheets with 44px rows, thumb-reachable, swipe to dismiss (Drawer already supports it: `ui/drawer.tsx`).

### R7. Global touch hygiene (S)
In `theme/tokens.css`: `touch-action: manipulation` on interactive elements (kills the double-tap delay), `-webkit-tap-highlight-color: transparent`, `overscroll-behavior-y: none` on the shell column, and a pressed state (`active:` scale or fill) on Button, Tabs and tab-bar items so a tap gives feedback where hover is guarded off.

### R8. Test where the guide says to (M)
The gate runs Chromium only. Add a WebKit project (`webkit-2311` is already cached on this machine) and viewports 393×852 (the guide's reference), 430×932 and 375×667. A true installed-PWA (standalone) check stays a device step; record it in `docs/deploy-branch.md` or a release checklist.

### R9. Promote `page-transition` and add a tab-slide default (S)
It's built, tested and unlisted. List it in `registry.json` and make AppShell back navigation use it, because slide transitions are in the guide's navigation list.

### R10. Per-app fixes (each its own ticket if picked)

| App | Fix | Before → after | Effort |
|---|---|---|---|
| **budget** | Re-theme onto the registry (budget#271), add `viewport-fit=cover`, manifest, icons, service worker; compress images | 10.3 MB and 16 of 18 small targets → <1 MB and 44px targets; installable | L |
| **atto1** | Pull the theme, add the head snippet and an AppShell tab bar, manifest and service worker | No `viewport-fit`, no tab nav, not installable → installable, safe-area correct | M |
| **watchtower** | Add manifest, `apple-touch-icon`, service worker | Fails offline, no icon → installable | S |
| **myargus/shell** | Add a service worker (it already has a manifest) | Offline reload fails → opens offline | S |
| **briefings, jobs** | Add manifest and service worker (or enable `vite-plugin-pwa` as reader and stockade do) | Not installable → installable | S each |
| **argus/email** | Add a fetch handler and offline shell to the push-only worker | No offline → shell opens offline | S |
| **scan-app, quick-capture** | Re-pull theme; give scan-app a manifest and worker; add AppShell to quick-capture | v3.1.0, no safe-area tokens → current | M each |
| **stockade** | Make "Manage passkeys in myargus settings" a 44px row | 107×18 link → 44px target | S |
| **knowledge** | Find what keeps the network from idling (`goto` timeout at 30 s) | Unknown activity → diagnosed | S |

## 5. Suggested order

1. R1 and R7 together (one day, no risk, fixes real iOS bugs).
2. R2 (the structural fix; makes R1 unnecessary to maintain).
3. R3 plus R4 (the PWA story; R4 stops it drifting again).
4. R5 device check, then R6.
5. Per-app fixes as capacity allows; R10 watchtower, shell, briefings, jobs, email are small and finish installability across the ecosystem.

## 6. Limits of this audit

- Source reading was README level for four pages (§1b); one reference 404'd; the rest of the guide's links were not read.
- Chromium emulation only; no Safari or iPhone. iOS-specific claims (zoom-on-focus for `<select>` at 14px, keyboard behaviour, status-bar band) come from WebKit's documented behaviour and the repo's own notes, not from this run.
- No Lighthouse score was taken; timings are `PerformanceNavigationTiming` from one run each, so treat them as indicative.
- Authenticated screens were never rendered; touch-target counts are for login and landing pages.
- Menu-row height (28px) is computed from classes, not measured.
- Three hosts could not be reached and two are tailnet-only; their rows are source-only.
