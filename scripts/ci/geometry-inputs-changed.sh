#!/usr/bin/env bash
# Decides whether the Curve geometry gate has to run (design-system#184).
#
# Usage: geometry-inputs-changed.sh <base-sha> <head-sha>
# Prints `geometry=true` or `geometry=false`; test.yml appends it to $GITHUB_OUTPUT.
#
# The gate takes ~4.5 minutes and reads only the files in INPUTS below: the registry
# blocks and theme it renders, its own scripts, the lockfile and package.json that
# pin its browser, and the workflow that runs it. When none of those changed in the
# range, the previous verdict still holds.
#
# It fails safe: anything it cannot decide (no base, a base this clone lacks, a diff
# error, a manual run) says true. A promotion never reaches it: the Release workflow runs
# the gate itself, unconditionally.
# A pull request is diffed against its merge base, so a base that moved on does not
# count as the PR's own change.
#
# Keep INPUTS in step with scripts/geometry-gate/harness/vite.config.mjs; the
# test/geometry-gate-filter.test.ts cases name one file from each entry.
set -uo pipefail

INPUTS='^(registry/|theme/|scripts/geometry-gate/|scripts/ci/geometry-inputs-changed\.sh$|\.github/actions/|\.github/workflows/test\.yml$|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|\.npmrc$)'

base="${1:-}"
head="${2:-}"
event="${GITHUB_EVENT_NAME:-push}"

say() { echo "geometry=$1"; exit 0; }

case "${event}" in
  push | pull_request) ;;
  *) say true ;;
esac

case "${base}" in
  "" | 0000000000000000000000000000000000000000) say true ;;
esac
[ -n "${head}" ] || say true

git cat-file -e "${base}^{commit}" 2>/dev/null || say true
git cat-file -e "${head}^{commit}" 2>/dev/null || say true

range="${base}..${head}"
[ "${event}" = pull_request ] && range="${base}...${head}"

changed="$(git diff --name-only "${range}" 2>/dev/null)" || say true

if grep -Eq "${INPUTS}" <<< "${changed}"; then
  say true
fi
say false
