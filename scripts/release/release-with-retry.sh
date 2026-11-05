#!/usr/bin/env bash
# Runs semantic-release up to 3 times, starting each attempt from the remote tip
# of main. Ported from argus's release.yml (argus-config#1016, map #1013).
#
# Why: with agents pushing straight to main, `main` can move between this run's
# checkout and the release's pushes. That shows up two ways, and both are safe
# to retry because nothing has been tagged or published yet:
#   1. semantic-release sees the local branch is behind, logs "is behind the
#      remote one" and exits 0 having released nothing. Left alone, the release
#      silently does not happen.
#   2. A release push (the release commit, or the pin plugin's restore commit)
#      is rejected as a non-fast-forward and semantic-release exits non-zero.
#
# Before every attempt (the first included) the checkout is made to equal
# origin/main exactly, dropping a half-finished attempt's local commits, staged
# files and detached HEAD. That is a rebase in effect: the release is redone on
# top of whatever landed, not merged with it.
#
# Anything else that fails (bad token, a rejected hook, a plugin error) is not
# a race and is not retried: its exit status is passed through.
#
# One thing a retry cannot undo: a rejection of the pin plugin's last push
# comes after the release commit has already reached main, so the redo adds a
# second chore(release) commit and a duplicate CHANGELOG section for the same
# version. The tag, the GitHub release and the pinned r/ are still made once.
#
# RELEASE_BRANCH is the branch the release runs on (default main). After the move to
# promotion-driven releases (design-system#179) it is deploy: each attempt then starts
# from the remote tip of deploy, the SHA the owner promoted, never from a newer main.
# CATCH_UP_FROM (e.g. main), when set, runs catch-up-release-tags.sh after each reset, so a
# release whose promoted SHA sits below the previous release's landing on main still
# sees that release's tag (see that script).
# RELEASE_COMMAND overrides the command; test/release-retry.test.ts uses it.
set -uo pipefail

RELEASE_BRANCH="${RELEASE_BRANCH:-main}"
CATCH_UP_FROM="${CATCH_UP_FROM:-}"
# Resolved before the first reset: the checkout switches under a running script.
CATCH_UP_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/catch-up-release-tags.sh"
RELEASE_COMMAND="${RELEASE_COMMAND:-pnpm exec semantic-release}"
# semantic-release reads its branch from GITHUB_REF (via env-ci). On a `workflow_run` event
# GitHub sets that to the default branch, not the branch the Test run was on, so a release
# from deploy saw `main`, logged "only publish from deploy" and did a dry run
# (design-system#190). Say which branch this is. GITHUB_HEAD_REF is unset because env-ci
# prefers it over GITHUB_REF. For the default RELEASE_BRANCH=main this is what a push to
# main already sets.
export GITHUB_REF="refs/heads/${RELEASE_BRANCH}"
unset GITHUB_HEAD_REF
LOG="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/semantic-release.log"
MAX_ATTEMPTS=3
# `[remote rejected]` (a protected branch or a hook) is deliberately not here.
REJECTED_PATTERN='failed to push some refs|\[rejected\]|non-fast-forward|fetch first|Updates were rejected'

reason=""
for attempt in $(seq 1 "${MAX_ATTEMPTS}"); do
  if ! git fetch --quiet origin "${RELEASE_BRANCH}"; then
    echo "::error::could not fetch origin ${RELEASE_BRANCH}"
    exit 1
  fi
  git checkout --quiet --force -B "${RELEASE_BRANCH}" "origin/${RELEASE_BRANCH}" || exit 1
  git clean --quiet -fd
  if [ -n "${CATCH_UP_FROM}" ]; then
    CATCH_UP_FROM="${CATCH_UP_FROM}" bash "${CATCH_UP_SCRIPT}" || exit 1
  fi

  bash -c "${RELEASE_COMMAND}" 2>&1 | tee "${LOG}"
  exit_code="${PIPESTATUS[0]}"

  if [ "${exit_code}" -eq 0 ]; then
    if ! grep -q "is behind the remote one" "${LOG}"; then
      exit 0
    fi
    reason="behind"
    echo "::warning::local main was behind the remote (attempt ${attempt} of ${MAX_ATTEMPTS})"
  elif grep -qE "${REJECTED_PATTERN}" "${LOG}"; then
    reason="rejected"
    echo "::warning::a release push was rejected, main moved under it (attempt ${attempt} of ${MAX_ATTEMPTS})"
  else
    exit "${exit_code}"
  fi
done

if [ "${reason}" = "behind" ]; then
  echo "::error::still behind the remote after ${MAX_ATTEMPTS} attempts, release skipped"
else
  echo "::error::release push was rejected ${MAX_ATTEMPTS} times because ${RELEASE_BRANCH} kept moving, release not completed"
fi
exit 1
