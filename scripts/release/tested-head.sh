#!/usr/bin/env bash
# The release gate's second half (design-system#159, #203). The Release job runs after the
# green `Test before release` job, but it checks out the tip of deploy (see release.yml),
# and deploy can have moved since that job began. This prints `release=true` only when
# the tip of the branch is exactly the SHA the tests went green on, so the tag semantic-release
# makes lands on the promoted SHA and on nothing newer. Otherwise it prints
# `release=false`: the newer promotion has its own run, tests and Release, and releases
# every commit since the last tag, this one's included.
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

head_sha="$(git rev-parse HEAD)"
if [ "${head_sha}" = "${tested_sha}" ]; then
  echo "release=true"
else
  echo "::notice::not releasing: the tip of the release branch is ${head_sha}, the tested SHA is ${tested_sha}" >&2
  echo "release=false"
fi
