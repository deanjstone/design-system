# CLAUDE.md

## Project purpose

`deanjstone/design-system` — shared shadcn/ui component registry and design tokens, consumed by `myargus`, `atto1`, `budget`, and `erto-apps` via the shadcn CLI. Not a buildable package: a plain GitHub-hosted `registry.json` manifest plus the source files it points to. See `README.md` for the consumption method and known gotchas.

## Key architecture notes

- `base-nova` shadcn style on Base UI (`@base-ui/react`), Tailwind v4 (`@theme inline`, no `tailwind.config.js`), OKLCH color tokens. Switched from `new-york`/Radix in ADR-0001 — don't add a second style variant without an ADR.
- No build step, no npm publish. Files are copied into consumer repos as-is by the shadcn CLI.
- Every new component: source file(s) under `registry/`, plus a matching `registry.json` entry, in the same commit — the two must never drift.

## Governance

**Director-Agent workflow:** All non-trivial work is recorded as a GitHub issue (spec + AI implementation plan), gated on Director approval in chat. `.claude/tasks/` holds only pre-2026-07-18 history. Read `.claude/SYSTEM.md` before making any structural changes.

## Agent skills

### Issue tracker

GitHub Issues (`deanjstone/design-system`) — authoritative record for all non-trivial Director-Agent work, and used by `to-tickets`, `wayfinder`, `to-spec`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
