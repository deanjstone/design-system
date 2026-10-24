#!/usr/bin/env bash
# Run Impeccable's design detector on the UI files a PR changed and print the counts.
# The detector makes no AI call. The workflow step that runs this script is
# continue-on-error, so a finding or a failed scan never blocks a merge.
#
#   bash scripts/design-detect.sh <base-sha>   scan UI files changed since <base-sha>
#
# Exit status is the detector's own: 0 clean, 1 a target could not be scanned,
# 2 findings. 2 is also returned for a usage error.
#
# Shipped by the design-system `design-check` registry item. The registry-owned ui
# directory (components.json `aliases.ui`) is never scanned: it is copied in by
# `shadcn add`, so a finding there is the registry's, not this app's.
set -euo pipefail

# The one place the detector version is pinned. Releases are frequent, so a bump is a
# deliberate edit here.
IMPECCABLE_VERSION="4.7.0"
# Its "explore directions" feature otherwise calls impeccable.style/api.
export DO_NOT_TRACK=1 IMPECCABLE_NO_TELEMETRY=1

[[ $# -eq 1 ]] || { echo "usage: $0 <base-sha>" >&2; exit 2; }
base="$1"

cd "$(git rev-parse --show-toplevel)"

emit() {
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    tee -a "$GITHUB_STEP_SUMMARY"
  else
    cat
  fi
}

# Print one exclude pathspec (a line starting with `:(`) per ui directory the repo's
# components.json files name, and one plain line per alias it could not map.
# `@/components/ui` and `~/components/ui` map to `components/ui`; a bare path is used
# as it is. A workspace-package alias (`@scope/pkg/dir`) cannot be mapped to a
# directory from here, so it is reported and left scanned: list its directory under
# `detector.ignoreFiles` in .impeccable/config.json, which the detector reads itself.
registry_owned_excludes() {
  local config alias dir
  while IFS= read -r config; do
    alias=$(jq -r '.aliases.ui // (if .aliases.components then .aliases.components + "/ui" else empty end)' "$config")
    [[ -n "$alias" ]] || continue
    case "$alias" in
      @/* | '~'/* | '#'/*) dir="${alias#?/}" ;;
      @*)
        echo "Not skipped: ui alias \`$alias\` in \`$config\` is a workspace package. Add its directory to \`detector.ignoreFiles\` in .impeccable/config.json."
        continue
        ;;
      *) dir="${alias#./}" ;;
    esac
    printf ':(exclude,glob)**/%s/**\n' "${dir%/}"
  done < <(git ls-files -- ':(glob)**/components.json')
}
excludes=()
notes=()
while IFS= read -r line; do
  if [[ $line == ':('* ]]; then excludes+=("$line"); else notes+=("$line"); fi
done < <(registry_owned_excludes)

# Added, copied, modified and renamed files only: a deleted file has nothing to scan.
mapfile -t files < <(git diff --name-only --diff-filter=d "$base" HEAD -- \
  '*.tsx' '*.jsx' '*.css' '*.html' '*.vue' '*.svelte' "${excludes[@]}")

heading="### Impeccable design check (impeccable@${IMPECCABLE_VERSION}, not blocking)"

notes_block() {
  local note
  for note in "${notes[@]}"; do printf '%s\n\n' "$note"; done
}

if [[ ${#files[@]} -eq 0 ]]; then
  { printf '%s\n\nNo UI files changed.\n\n' "$heading"; notes_block; } | emit
  exit 0
fi

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

status=0
npx --yes "impeccable@${IMPECCABLE_VERSION}" detect --json "${files[@]}" > "$scratch/findings.json" 2> "$scratch/stderr.txt" || status=$?

{
  echo "$heading"
  echo
  echo "${#files[@]} changed UI file(s) scanned."
  echo
  notes_block
} | emit

if [[ $status -ne 0 && $status -ne 2 ]]; then
  {
    echo "A target could not be scanned (detector exit $status)."
    echo
    echo '```'
    tail -n 20 "$scratch/stderr.txt"
    echo '```'
  } | emit
  exit "$status"
fi

if ! jq -e 'type == "array"' "$scratch/findings.json" > /dev/null 2>&1; then
  echo "The detector printed no JSON findings (exit $status)." | emit
  exit 1
fi

root="$PWD/"
{
  echo "$(jq 'length' "$scratch/findings.json") findings."
  echo
  if [[ $(jq 'length' "$scratch/findings.json") -gt 0 ]]; then
    echo '| Rule | Severity | Count |'
    echo '|---|---|---|'
    jq -r 'group_by([.antipattern, .severity])
      | sort_by(if .[0].severity == "advisory" then 1 else 0 end)
      | .[] | "| \(.[0].antipattern) | \(.[0].severity) | \(length) |"' "$scratch/findings.json"
    echo
    echo 'First findings (blocking-severity first):'
    echo
    jq -r --arg root "$root" 'sort_by(if .severity == "advisory" then 1 else 0 end)
      | .[0:10][]
      | "- `\(.file | ltrimstr($root)):\(.line)` \(.antipattern): \(.snippet)"' "$scratch/findings.json"
  fi
} | emit

exit "$status"
