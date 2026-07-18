# Task-001: Expand registry from consuming-repo research

## 1. Specification (Human Authored)

- **Objective:** Grow `design-system` past its current 3 items (theme, utils, button) by
  harvesting proven components/tokens from repos that already consume or could consume it,
  then land the registry in a real first consumer.
- **Requirements:**
  1. Survey `myargus/packages/ui`, `atto1`, `budget/web`, `erto-apps` for existing UI
     components and design tokens worth merging into the shared registry. (Done — see
     research summary below.)
  2. Decide sourcing strategy per repo (port in, adopt from, or rule out).
  3. Propose a concrete, ordered set of registry additions (tokens + components).
  4. Get Director approval before any `registry.json` / `registry/` changes.
- **Architectural Boundary:** No build step, no npm publish. `new-york` style stays fixed.
  Tailwind v4 / OKLCH tokens only. Don't add a second style variant. Don't merge in
  budget's app-specific components (empty-state, error-display, multi-select,
  number-ticker, empty-state-skeleton) — those are product-specific, not registry-grade.

## Research summary (4 parallel surveys, 2026-07-18)

| Repo | Verdict | Why |
|---|---|---|
| **budget/web** | **Primary source to harvest FROM** | 23 genuine shadcn new-york components (of 28 files; 5 are custom app components) confirmed via `cva`/`@radix-ui/*`/`data-slot` conventions. Full token set already in production: `--radius`, `--card`, `--popover`, `--chart-1..5`, `--sidebar*` — exactly the gap noted in design-system's own README/TODO. `components.json` `registries` field is empty (cleaned up post PR#70) — no live coupling to reverse. |
| **atto1** | **Primary target to adopt INTO** | Zero components, zero tokens, no `components.json` — genuinely clean slate, confirms prior "cleanest first consumer" note. Needs `card`, `input`/`label`, `form`, `table` next per its planned features (dashboard, session/maintenance logs, forms). Root `tsconfig.json` is solution-style with no `paths` — the known CLI gotcha applies; needs `baseUrl`/`paths` added to root `tsconfig.json` (and checked in `tsconfig.app.json`/`vite.config.ts`) *before* the first `shadcn add`. |
| **myargus/packages/ui** | **Rebuild fresh, not a port** | Only 2 components (Button, Card), both hand-rolled — no `cva`, no Radix, no tokens, string-concatenated classNames, still on Tailwind v3. Nothing here is worth porting; migrating means adding fresh registry components, same as any other consumer, plus a Tailwind v3→v4 bump in that package first. Low priority — not blocking the other two repos. |
| **erto-apps** | **Ruled out** | All three sub-apps are non-fits: `certificate-generator` is ASP.NET Core MVC/Bootstrap (Razor, no React), `hungarian-solver` is a single dependency-free HTML file on the Tailwind CDN script (no build tooling, no tokens), `xlsm-register` is a PowerShell/Excel macro tool. No React app exists to consume or contribute to a React component registry. Revisit only if `hungarian-solver` ever gets a real toolchain. |

## 2. AI Implementation Plan (AI Authored)

*Pending Director approval below before any code changes.*

### Scope of changes

**Files to modify:**
- `registry.json` — extend the `theme` item's `cssVars` with the missing core shadcn set:
  `--radius`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`,
  `--chart-1` through `--chart-5`. (Sourced from budget/web's `:root`/`.dark`, which already
  has these in standard shadcn form — not budget's extended brand/pastel/semantic layer,
  which is product-specific and out of scope per the architectural boundary.)
  Then add new `registry:ui` entries, one per ported component, each with correct
  `registryDependencies`/`dependencies` mirroring budget/web's imports.
- `theme/tokens.css` — mirror the same token additions (kept in sync with the `theme` item
  per this repo's own constraint that the two must never drift).

**Files to create:**
- `registry/new-york/ui/<component>.tsx` for each ported component (proposed first batch
  below), sourced from budget/web's `web/src/components/ui/*.tsx`, stripped of any
  budget-specific styling and re-verified against plain shadcn output.

**Files NOT touched:**
- `atto1`, `myargus`, `budget` — no changes in this task. Adoption into `atto1` and the
  `tsconfig.json` alias fix are a separate follow-up task, after the registry additions
  land and are validated by pulling them into a scratch project.
- budget's 5 custom app components — excluded per architectural boundary.
- erto-apps — no action.

### Step-by-step execution plan

**Step 1 — Extend the theme item**
Add the missing core tokens to both `registry.json`'s `theme` item and `theme/tokens.css`,
in the same commit, light and dark variants both.

**Step 2 — Port first component batch**
Pending Director's pick of which components matter most for atto1's near-term needs.
Proposed order (highest reuse, lowest risk first): `card`, `label`, `input`, `dialog`,
`tabs`, `badge`. Each gets its own `registry/new-york/ui/*.tsx` file plus a matching
`registry.json` entry (name, type, registryDependencies, dependencies) in the same commit
as its source file, per this repo's stated constraint.

**Step 3 — Validate**
Pull the new items into a scratch Vite project via `npx shadcn add deanjstone/design-system/<item>`
(branch tip, not yet tagged) to confirm they resolve and render before considering this done.

**Step 4 — Update TODO.md**
Move the "adopt in atto1" and "migrate myargus/packages/ui" backlog items to reflect the
research above (atto1 confirmed as target; myargus reframed as "build fresh" not
"migrate"; erto-apps removed as a non-candidate).

### Risks / tradeoffs

- Porting from budget/web risks silently carrying over budget-specific class names or
  behavior if not diffed carefully against vanilla shadcn output — Step 3's scratch-project
  validation is meant to catch this before it reaches atto1.
- Extending the theme item's token set is a breaking-ish change for future consumers
  relying on the old minimal set, but there are no live consumers yet (budget's
  `registries` field is already empty), so no migration cost today.
- Component batch selection (Step 2) is a judgment call tied to atto1's roadmap — flagged
  as pending Director input rather than assumed.

## 3. Human Approval Sign-off

- **Status:** Pending
- **Director Review Notes:** —

## 4. Verification Checklist (AI Completed)

- [ ] `registry.json` and `theme/tokens.css` token sets match exactly (no drift)
- [ ] Each new component entry's `registryDependencies`/`dependencies` are complete and correct
- [ ] Scratch-project `shadcn add` pull succeeds for every new item with no missing deps
- [ ] `docs/TODO.md` updated to reflect this task's outcome
