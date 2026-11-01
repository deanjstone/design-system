# ADR-0004: One cross-repo URL taxonomy and a governed links registry

- **Status:** accepted
- **Date:** 2026-11-01
- **Deciders:** Owner (confirmed in an Aquila grilling, 09:10-09:50 AEDT 1 Nov 2026)
- **Supersedes:** myargus [ADR-008](https://github.com/deanjstone/myargus/blob/main/docs/decisions/adr-008-url-taxonomy.md) (its bucket policy now covers the argus apps and carries a classification test; the supersession note on ADR-008 itself is made in the myargus migration ticket)
- **Resolves:** [Build the myargus links registry, taxonomy ADR and link-check](https://github.com/deanjstone/design-system/issues/152), on [Map: governed link construction for myargus.cc and tailnet hosts](https://github.com/deanjstone/design-system/issues/151)

## Context

A survey on 1 Nov 2026 found about 935 `myargus.cc` references across argus,
myargus, budget, homelab, argus-config, design-system and quick-capture, with
atto1 also holding code references. Nine hand-kept app-switcher lists
(`apps/*/src/lib/apps.ts`, six in myargus and three in argus) had drifted: all
six myargus copies differed, and three apps still linked `knowledge.myargus.cc`
after the app moved to `myargus.cc/knowledge/`. `SHARED_DOMAIN` was copied into
every `theme-domain.ts`. Backend code carried its own defaults, one of them
a placeholder host in a production fallback.

myargus ADR-008 gave the URL space four buckets but covered only the myargus
monorepo, set no rule for choosing a bucket, and had no enforcement. Hosts
retired in practice (`read.`, `api.read.`, `edms.`) were still probed or
referenced, and tailnet services (`homelab.tail00500e.ts.net:<port>`) had no
policy at all.

## Decision

**1. Scope.** The taxonomy and registry cover every public `*.myargus.cc` URL
(UI apps and routes, backend- and agent-emitted links, API and MCP endpoints,
the shared cookie domain) and the tailnet service URLs.

**2. Four buckets, one test.** ADR-008's buckets stand, now for every repo:

| Bucket | Form |
|---|---|
| Internal app | `myargus.cc/<app>/` |
| External app | `<app>.myargus.cc` |
| API | `api.myargus.cc/<app>` |
| MCP | `mcp.myargus.cc/<app>` |

Tailnet services are a fifth entry kind, `https://homelab.tail00500e.ts.net:<port>/`.
A new service is classified with one test: **if it shares the shell's sign-in,
it is a path (internal app); if it has its own deploy, its own auth or is gated
by Cloudflare Access, it is a subdomain (external app).** APIs and MCP servers
are always paths on their shared hosts.

**3. Source of truth.** design-system ships `links.json` and a generated TS
module (`links.ts`) as registry items, plus a vendored bash helper (`links.sh`)
that reads the JSON with `jq`. Each entry has a bucket, a status, a host and
path, the routes other apps link to, the expected anonymous probe status, and
its edge hosting and Access gating. The registry also holds the shared cookie
domain. argus `ecosystem/manifest.json` hrefs are checked against it.

**4. Canonical forms.** https only, no `www`. App roots end in `/`
(`https://ops.myargus.cc/`, `https://myargus.cc/reader/`). In-app routes have no
trailing slash (`/plans`, `/plans/<slug>`). API and MCP bases have no trailing
slash. Builders join with exactly one `/`. A route is built only if the registry
lists it, so a cross-app link cannot point at a path nobody registered.

**5. Backend and agent code.** URLs come from the builders. An environment
variable may override only an origin per deployment (the builders take an
`origin` option); no code carries a hardcoded fallback host.

**6. Enforcement.** (a) `link-check`, a blocking grep-based literal ban shipped
as a registry item with its workflow; markdown and test fixtures are exempt.
(b) A drift and config check in the same script: a vendored registry behind
design-system's, or wrangler routes, `_redirects`, Vite `base`, router
`basename` or manifest `start_url` and `scope` that disagree with the registry.
(c) watchtower-collector's probe list is derived from the registry. Oxlint is
the only lint tool (argus-config#1003); no ESLint or Biome rules.

**7. MCP hosts.** `memory.myargus.cc` and `vault.myargus.cc` migrate to
`mcp.myargus.cc/memory` and `mcp.myargus.cc/vault`; the old hosts stay as
aliases for a window and are then retired. Until the move, the registry entry
holds the live location and names the target in `moveTo`, so one registry edit
moves every consumer when the owner approves the live step.

**8. Statuses.** Every entry is `live`, `planned`, `redirect` or `retired`.
Retired: `read.`, `api.read.`, `edms.` (public). Redirect: `knowledge.` (once
myargus#221 lands) and `board.` to `ops.`. Planned: `t3.` (homelab#292) and
`atto1.` (atto1#47); never probed until live. Builders follow a redirect to its
target, refuse a retired entry, and build a planned one so code can be written
before the host exists. A reference to a retired host fails `link-check`.

**9. Edge config is checked, never generated.** CI checks the config held in
git. A read-only script (`scripts/links/cf-drift.mjs`) diffs Cloudflare's live
DNS, tunnel ingress and Access apps against the registry and prints the drift.
It makes only GET requests. Nothing generates wrangler routes, `_redirects`,
DNS, tunnel ingress or Access.

**10. Order.** Registry, ADR and check; then a report-only baseline in every
repo; then migration repo by repo (myargus first); each repo's check flips to
blocking at 0; host moves last, as owner-approved live steps.

## Rationale

**One registry removes the drift instead of policing it.** Nine switcher lists
diverged because each was a copy. A shared list with a builder per URL kind
leaves nothing to copy, and the literal ban stops a new copy appearing.

**A test, not a precedent, decides the bucket.** ADR-008 described the buckets
but not the choice; services landed on subdomains by habit (`knowledge.`).
Sign-in sharing is the property that actually differs: a path shares the
shell's cookies, storage and permissions (non-overlapping path scopes behave as
one origin), while a service with its own auth gains nothing from the shell's
origin and risks nesting its install scope under the shell's.

**Check the edge, don't generate it.** The public edge is Cloudflare (Pages,
Worker routes, tunnel ingress, Access), managed in Cloudflare and not in git.
Generating it would make the registry a deploy tool with write access to
production; a read-only diff gives the same protection against drift with none
of that risk.

**`moveTo` instead of listing the target now.** Decision 10 puts host moves
last. If the registry named the future location today, migrated code would
build URLs that do not answer yet.

## Consequences

**Every consumer is edited once.** The repo rename (design-system becomes
`frontend`) is folded into the same per-repo migration tickets. Nothing may be
created under the old `deanjstone/design-system` name after the rename; the old
raw URLs keep working only through GitHub's redirect.

**The registry is vendored, so it can fall behind.** `link-check` compares the
vendored `links.json` with design-system's by revision and fails on a gap or a
same-revision difference. If design-system cannot be reached, the check says so
and passes, so an outage there does not block unrelated work.

**Listing a route is now a change to design-system.** `routeUrl` throws for an
unregistered route. That friction is the point for links that cross an app
boundary; links inside one app's own router stay in that app.

**Tailnet services not yet in the registry.** Ports 3850 (quick-capture) and
3747 (agent-engine) are tailnet-only per the project registry, but no `https`
tailnet reference to them exists in any repo today, so they are not listed. A
migration ticket that finds one adds it.

**The baseline is a count, not a blocker.** Report mode exits 0 everywhere;
a repo flips to blocking only when its own report reads 0.

## Alternatives considered

**Keep ADR-008 and add a lint rule.** Rejected: oxlint is the only lint tool,
a rule cannot know the host list, and ADR-008 still left the bucket choice
undecided.

**Generate Cloudflare config from the registry.** Rejected (decision 9):
production write access from a data file, for a problem a read-only diff solves.

**One origin for everything (all paths).** Rejected: budget, ops and the other
Access-gated or independently deployed apps need their own auth and deploy
cadence, and the manifest `scope` of a nested app suppresses its install prompt.
