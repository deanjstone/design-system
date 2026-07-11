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

- All non-trivial work begins with a task file in `.claude/tasks/task-NNN-<name>.md`.
- Claude must append its implementation plan to the task file before writing any code.
- Code execution is blocked until the Director provides explicit approval in chat.
- Chat is the UI; the task file is the source of truth.
