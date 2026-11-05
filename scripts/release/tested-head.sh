#!/usr/bin/env bash
# The release gate's second half (design-system#159). The Release job runs after the
# green `Test before release` job, but it releases from the tip of deploy (see
# release.yml), and deploy can have moved since that job began. This prints `release=true` only when
# the SHA the tests went green on is still the newest real commit on the branch, so every
# commit semantic-release is about to publish has been through a green test job.
# Otherwise it prints `release=false`: the newer promotion has its own run, tests and
# Release.
#
# "Real" excludes the release bot's own commits, which are made with CI
# skipped and so never get a Test run. They are told apart by the subject
# `chore(release):` at the start; a lookalike later in a subject does not count.
# A real commit that skipped CI also blocks the release: it has no green Test.
#
# Usage: tested-head.sh <tested-sha>, run inside a checkout of the release branch. Always
# exits 0 with one of the two lines on stdout, or non-zero (printing nothing
# on stdout) when called wrongly, so a broken call can never read as `true`.
set -euo pipefail

tested_sha="${1:-}"
if [ -z "${tested_sha}" ]; then
  echo "usage: tested-head.sh <tested-sha>" >&2
  exit 2
fi

newest_real=""
while IFS=$'\t' read -r sha subject; do
  case "${subject}" in
    "chore(release): "*) continue ;;
  esac
  newest_real="${sha}"
  break
done < <(git log --first-parent --format=$'%H\t%s' HEAD)

if [ -n "${newest_real}" ] && [ "${newest_real}" = "${tested_sha}" ]; then
  echo "release=true"
else
  echo "::notice::not releasing: the newest real commit on the release branch is ${newest_real:-none}, the tested SHA is ${tested_sha}" >&2
  echo "release=false"
fi
