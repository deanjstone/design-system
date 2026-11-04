#!/usr/bin/env bash
# Promote a commit on main by fast-forwarding the deploy branch (design-system#179, map
# argus-config#1048). Pushing deploy is what releases a new registry version: the Release
# workflow runs on a push to deploy only, never on a push to main.
#
#   scripts/promote.sh <sha|ref>            push <sha> to deploy, fast-forward only
#   scripts/promote.sh --dry-run <sha|ref>  show what would ship and the push, change nothing
#
# Rules it enforces:
#   - the target must already be on origin/main (any main SHA, not only a release tag)
#   - the target must not carry the skip-CI marker in its message: GitHub runs no workflow
#     for a push whose head commit carries it, and the release bot adds it to its version
#     commit, so promoting that commit moves deploy and deploys nothing (argus-config#1060).
#     The script names the nearest commit below it without the marker and stops; it never
#     swaps the SHA, because the deploy gate approves the literal command
#   - deploy only moves forward: rollback is `git revert` on main, then a new promotion
#   - it runs from the owner's own credentials, never in GitHub Actions: a push made
#     with GITHUB_TOKEN does not trigger other workflows, so nothing would deploy
#
# Run it from a T3 approval-required thread or a terminal: the deploy gate asks for
# live approval there and denies it in every other permission mode (#548).
set -euo pipefail

REMOTE="${PROMOTE_REMOTE:-origin}"
dry_run=false

usage() {
  echo "usage: $0 [--dry-run] <sha|ref on $REMOTE/main>" >&2
  exit 2
}

[[ "${1:-}" == "--dry-run" ]] && { dry_run=true; shift; }
[[ $# -eq 1 ]] || usage
target_ref="$1"

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  echo "promote: refusing to run in GitHub Actions. A push made with GITHUB_TOKEN" >&2
  echo "triggers no other workflow, so deploy would move and nothing would deploy." >&2
  echo "Run it locally, from an approval-required thread or a terminal." >&2
  exit 1
fi

git fetch --quiet "$REMOTE" main
# deploy is absent until the first promotion.
git fetch --quiet "$REMOTE" "+refs/heads/deploy:refs/remotes/$REMOTE/deploy" 2> /dev/null || true

# A bare branch name means the remote's copy of it, so `promote main` ships origin/main.
if git rev-parse --quiet --verify "refs/remotes/$REMOTE/$target_ref^{commit}" > /dev/null; then
  target_ref="$REMOTE/$target_ref"
fi
if ! sha="$(git rev-parse --quiet --verify "$target_ref^{commit}")"; then
  echo "promote: unknown commit '$1'" >&2
  exit 1
fi

if ! git merge-base --is-ancestor "$sha" "$REMOTE/main"; then
  echo "promote: $sha is not on $REMOTE/main. Merge it to main first." >&2
  exit 1
fi

current=""
if git rev-parse --quiet --verify "refs/remotes/$REMOTE/deploy" > /dev/null; then
  current="$(git rev-parse "refs/remotes/$REMOTE/deploy")"
fi

# What GitHub honours in a commit message to skip push workflows: a bracketed phrase,
# or a skip-checks trailer set to true.
carries_skip_marker() {
  local message
  message="$(git log -1 --format=%B "$1")"
  grep -Eiq -e '\[(skip ci|ci skip|no ci|skip actions|actions skip)\]' \
    -e '^skip-checks:[[:space:]]*true' <<< "$message"
}

if carries_skip_marker "$sha"; then
  echo "promote: $sha carries the skip-CI marker in its commit message." >&2
  echo "GitHub runs no workflow for a push whose head commit carries the marker, so" >&2
  echo "promoting it would move deploy and deploy nothing." >&2
  safe=""
  while read -r candidate; do
    [[ "$candidate" == "$sha" ]] && continue
    carries_skip_marker "$candidate" && continue
    safe="$candidate"
    break
  done < <(git rev-list --first-parent "$sha")
  if [[ -z "$safe" ]] || { [[ -n "$current" ]] && git merge-base --is-ancestor "$safe" "$current"; }; then
    echo "There is no deployable commit ahead of deploy. Wait for the next commit on main" >&2
    echo "that does not carry the marker, then promote that." >&2
  else
    echo "The nearest commit below it without the marker:" >&2
    git log -1 --oneline "$safe" >&2
    echo "Run instead:" >&2
    echo "  scripts/promote.sh $safe" >&2
  fi
  exit 1
fi

if [[ "$current" == "$sha" ]]; then
  echo "promote: deploy is already at $sha. Nothing to do."
  exit 0
fi

if [[ -n "$current" ]] && ! git merge-base --is-ancestor "$current" "$sha"; then
  echo "promote: $sha is not a fast-forward of deploy ($current)." >&2
  echo "deploy never moves backwards. To roll back, revert on main and promote the revert:" >&2
  echo "  git revert <bad-sha>   # on a branch, then PR and merge to main" >&2
  echo "  scripts/promote.sh <the revert's SHA on main>" >&2
  exit 1
fi

if [[ -z "$current" ]]; then
  echo "promote: creating deploy at $sha (first promotion)."
else
  echo "promote: deploy $current -> $sha. Shipping:"
  git log --oneline "$current..$sha"
fi

push=(git push "$REMOTE" "$sha:refs/heads/deploy")
if $dry_run; then
  echo "dry run, would run: ${push[*]}"
  exit 0
fi
"${push[@]}"
echo "promote: done. Watch the deploy: gh run list --branch deploy --limit 5"
