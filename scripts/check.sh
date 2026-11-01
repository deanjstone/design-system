#!/usr/bin/env bash
# The three CI checks, run locally before a push (argus-config#1013, #1015).
# Workers run `pnpm check` and paste its last line into the issue; CI stays the
# backstop. No git hook runs this: it is a step in the worker's brief.
#
# Steps, in order, each matching a CI job exactly:
#   1. pnpm test                                  .github/workflows/test.yml   "Run tests"
#   2. npx impeccable detect registry/ theme/     .github/workflows/design.yml "Detect UI anti-patterns"
#   3. npx shadcn build --output ./r, then r/ must not have drifted
#                                                 .github/workflows/design.yml "Rebuild per-item output and fail if it drifted"
#
# The two pins below must equal the ones in design.yml (and shadcn's in
# package.json build:theme); test/check-script.test.ts fails when they drift.
#
# Step 3 is slightly stricter than CI: CI only runs `git diff`, which cannot see
# an r/ file the build created but nobody added. This also fails on an untracked
# file under r/, because that is a stale r/ that would reach consumers.
#
# On success prints one line: `check: pass <short sha>`. Any failure exits
# non-zero and names the failing step.
set -euo pipefail

IMPECCABLE_VERSION=3.6.1
SHADCN_VERSION=4.19.1

builtin cd "$(git rev-parse --show-toplevel)"

fail() {
  echo "check: FAIL at step $1 ($2)" >&2
  exit 1
}

echo "check: step 1/3 pnpm test" >&2
pnpm test || fail "1/3" "pnpm test"

echo "check: step 2/3 impeccable detect" >&2
npx --yes "impeccable@${IMPECCABLE_VERSION}" detect registry/ theme/ || fail "2/3" "impeccable detect registry/ theme/"

echo "check: step 3/3 registry output current" >&2
npx --yes "shadcn@${SHADCN_VERSION}" build --output ./r || fail "3/3" "shadcn build"
if ! git diff --quiet -- r/ || [ -n "$(git ls-files --others --exclude-standard -- r/)" ]; then
  git status --short -- r/ >&2
  fail "3/3" "r/ is out of date: run 'npx shadcn@${SHADCN_VERSION} build --output ./r' and commit the result"
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "check: note: the working tree has uncommitted changes; this result is not for HEAD alone" >&2
fi
echo "check: pass $(git rev-parse --short HEAD)"
