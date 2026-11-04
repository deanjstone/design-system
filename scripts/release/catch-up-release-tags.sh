#!/usr/bin/env bash
# Makes the newest release tag visible to a release that runs from `deploy`
# (design-system#179).
#
# semantic-release finds the last release with `git tag --merged <branch>`. A
# release's tagged commit S lands on main (see semantic-release-pin.mjs), but
# `deploy` only ever holds a SHA the owner promoted, and that SHA can sit below the
# commit that took S into main: a commit landing while the previous release ran
# is promoted next. Then S is not in deploy's history, the last release is not
# found, and the next version is computed from an older tag.
#
# This merges the newest v* tag that origin/$CATCH_UP_FROM contains into the
# current checkout, as a local commit that is never pushed: the tree stays the
# promoted SHA's, except CHANGELOG.md, taken from the tag so the changelog stays
# cumulative (it is only ever written by a release). Nothing happens when that tag
# is already in HEAD's history or no tag exists yet.
#
# Usage: CATCH_UP_FROM=main catch-up-release-tags.sh, run inside the release checkout.
set -euo pipefail

source_branch="${CATCH_UP_FROM:-}"
if [ -z "${source_branch}" ]; then
  echo "usage: CATCH_UP_FROM=<branch> catch-up-release-tags.sh" >&2
  exit 2
fi

git fetch --quiet --tags origin "${source_branch}"

newest=""
while IFS= read -r tag; do
  newest="${tag}"
  break
done < <(git tag --merged "origin/${source_branch}" --list 'v*' --sort=-v:refname)

if [ -z "${newest}" ]; then
  echo "catch-up: no release tag on origin/${source_branch} yet"
  exit 0
fi
if git merge-base --is-ancestor "${newest}" HEAD; then
  echo "catch-up: ${newest} is already in this checkout's history"
  exit 0
fi

# The runner has no git identity of its own.
export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-semantic-release-bot}"
export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-semantic-release-bot@martynus.net}"
export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-${GIT_AUTHOR_NAME}}"
export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-${GIT_AUTHOR_EMAIL}}"

git merge --quiet --no-ff --no-commit -s ours "${newest}"
if git cat-file -e "${newest}:CHANGELOG.md" 2> /dev/null; then
  git checkout "${newest}" -- CHANGELOG.md
fi
git commit --quiet -m "chore: catch up to ${newest} (local release checkout only, not pushed)"
echo "catch-up: merged ${newest} into the release checkout"
