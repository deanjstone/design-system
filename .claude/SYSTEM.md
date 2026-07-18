# SYSTEM.md — design-system

## What this repo is

A static shadcn/ui component registry, not a buildable application. `registry.json`
at the root is the manifest the shadcn CLI reads directly from GitHub; the files it
references under `registry/` are the actual distributable source. Consumers pull
items with `npx shadcn add @design-system/<item>` — see README.md.

## Constraints

- **No build step, no npm publish.** Files are copied into consumer repos as-is by
  the shadcn CLI. Don't add a bundler, don't add `dist/`.
- **pnpm only** if any tooling is ever added here (lint, format scripts) — never
  npm/yarn, consistent with the rest of the account's projects.
- **TypeScript, strict, no `any`** for any `.ts`/`.tsx` file added to `registry/`.
- **`new-york` style is fixed.** Don't add a second style variant without an ADR —
  consumers assume one consistent look.
- **Tailwind v4 assumed.** Tokens use `@theme inline` + OKLCH, no
  `tailwind.config.js`. Don't add v3-style config.
- Every new component: add the source file(s) under `registry/`, then add a
  matching `registry.json` entry (name, type, files, registryDependencies,
  dependencies) in the same commit. The two must never drift.

## Director-Agent Workflow

- All non-trivial work begins with a GitHub issue — the issue is the source of truth, not a `.claude/tasks/` file. See `docs/agents/issue-tracker.md`.
- Claude writes the specification into the issue body under "## Specification", then appends its implementation plan under "## AI Implementation Plan" (files to create/modify/delete, step-by-step execution, risks) before writing any code.
- Claude summarises the plan in chat so the Director can review without opening the issue.
- Code execution is blocked until the Director provides explicit approval in chat.
- Claude executes, comments on the issue with the verification checklist and results, and closes it once the Director confirms the work is merged.
- Chat is the interface — the GitHub issue is the record.
- **Migration note (2026-07-18):** this repo's Director-Agent record moved from `.claude/tasks/task-NNN-*.md` files to GitHub issues, adopting Matt Pocock's skills convention in full. No task file was ever merged to `main` — the one opened pre-migration (task-001) was superseded by wayfinder map #5 and closed without merging. No new task files are created going forward.
