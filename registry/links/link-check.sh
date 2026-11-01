#!/usr/bin/env bash
# link-check:vendored
# Ban hand-written myargus.cc and tailnet host literals in code, and check the
# repo's host and path config against links.json (design-system ADR-0004,
# decision 6). Shipped by the design-system `link-check` registry item.
#
#   bash scripts/link-check.sh [--mode report|block]
#
# report (default, or LINK_CHECK_MODE): print every finding and a summary line
#   `link-check: summary <repo> literals=N retired=M config=K drift=D mode=report`,
#   exit 0. This is the baseline run (decision 10).
# block: the same output, exit 1 when any count is above 0. A repo flips its
#   workflow to block when its report reaches 0.
#
# Findings:
#   literal  a line in tracked code naming the domain or the tailnet host
#   retired  a literal that names a host links.json marks retired
#   config   Vite base, router basename, manifest start_url/scope, wrangler host
#            and path, or a _redirects target that links.json does not hold
#   drift    the vendored links.json is behind design-system's, or differs from it
#
# Exempt from literal and retired: markdown, test files and fixtures, lockfiles,
# changelogs, wrangler config and _redirects/_headers (the config check covers
# those), any file whose first 10 lines carry the vendored-file marker, and the
# globs in .link-check-ignore (one git pathspec glob per line, # for comments).
# Scans `git ls-files` only. Needs git and jq; node for the config half.
set -euo pipefail

usage() {
  echo "usage: link-check.sh [--mode report|block]" >&2
  exit 2
}

mode="${LINK_CHECK_MODE:-report}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) [[ $# -ge 2 ]] || usage; mode="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ $mode == report || $mode == block ]] || usage

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
builtin cd "$(git rev-parse --show-toplevel)"
root="$PWD"

registry="${LINKS_JSON:-}"
if [[ -z $registry ]]; then
  for candidate in "$root/links.json" "$here/../links.json" "$here/links.json"; do
    [[ -f $candidate ]] && registry="$candidate" && break
  done
fi
if [[ -z $registry || ! -f $registry ]]; then
  echo "link-check: no links.json found; install it with 'shadcn add deanjstone/design-system/links-data' or set LINKS_JSON" >&2
  exit 2
fi
command -v jq > /dev/null || { echo "link-check: jq is required" >&2; exit 2; }

repo_name="${LINK_CHECK_REPO-}"
if [[ -z $repo_name ]]; then
  remote="$(git remote get-url origin 2> /dev/null || true)"
  repo_name="$(basename "${remote:-$root}" .git)"
fi

domain="$(jq -r '.domain' "$registry")"
tailnet_host="$(jq -r '.tailnetHost' "$registry")"
escape() { sed 's/[.[\*^$()+?{|]/\\&/g' <<< "$1"; }

# Pathspecs: what neither check scans, and what only the literal check skips.
common_excludes=(
  ':(exclude,glob)**/*.md' ':(exclude,glob)**/*.mdx'
  ':(exclude,glob)**/test/**' ':(exclude,glob)**/tests/**' ':(exclude,glob)**/__tests__/**'
  ':(exclude,glob)**/fixtures/**' ':(exclude,glob)**/__fixtures__/**'
  ':(exclude,glob)**/*.test.*' ':(exclude,glob)**/*.spec.*'
  ':(exclude,glob)**/pnpm-lock.yaml' ':(exclude,glob)**/package-lock.json' ':(exclude,glob)**/yarn.lock' ':(exclude,glob)**/*.lock'
  ':(exclude,glob)**/CHANGELOG*'
)
if [[ -f .link-check-ignore ]]; then
  while IFS= read -r glob; do
    [[ -z $glob || $glob == \#* ]] && continue
    common_excludes+=(":(exclude,glob)$glob")
  done < .link-check-ignore
fi
literal_excludes=(
  "${common_excludes[@]}"
  ':(exclude,glob)**/wrangler.toml' ':(exclude,glob)**/wrangler.json' ':(exclude,glob)**/wrangler.jsonc'
  ':(exclude,glob)**/_redirects' ':(exclude,glob)**/_headers'
)

declare -A vendored=()
is_vendored() {
  local file="$1"
  if [[ -z ${vendored[$file]+x} ]]; then
    if head -n 10 -- "$file" 2> /dev/null | grep -q 'link-check:vendored'; then vendored[$file]=1; else vendored[$file]=0; fi
  fi
  [[ ${vendored[$file]} == 1 ]]
}

# scan <pattern>...: matching lines of tracked, non-exempt, non-vendored files.
scan() {
  local args=() pattern line file
  for pattern in "$@"; do args+=(-e "$pattern"); done
  while IFS= read -r line; do
    file="${line%%:*}"
    is_vendored "$file" || printf '%s\n' "$line"
  done < <(git grep -nIE "${args[@]}" -- . "${literal_excludes[@]}" 2> /dev/null || true)
}

emit() { # kind lines...
  local kind="$1" line
  shift
  for line in "$@"; do printf 'link-check: %s %s\n' "$kind" "${line:0:200}"; done
}

mapfile -t literal_lines < <(scan "$(escape "$domain")" "$(escape "$tailnet_host")")

retired_patterns=()
while IFS= read -r host; do
  [[ -n $host ]] && retired_patterns+=("(^|[^A-Za-z0-9.-])$(escape "$host")")
done < <(jq -r '.entries[] | select(.status == "retired" and .host != null) | .host' "$registry")
retired_lines=()
if [[ ${#retired_patterns[@]} -gt 0 ]]; then
  mapfile -t retired_lines < <(scan "${retired_patterns[@]}")
fi

config_lines=()
if command -v node > /dev/null; then
  config_script="$here/link-check-config.mjs"
  [[ -f $config_script ]] || config_script="$root/scripts/link-check-config.mjs"
  mapfile -t config_lines < <(
    git ls-files -z -- . "${common_excludes[@]}" | node "$config_script" "$registry"
  )
else
  echo "link-check: config skipped (node not found)" >&2
fi

drift_lines=()
upstream_url="${LINKS_UPSTREAM:-https://raw.githubusercontent.com/deanjstone/design-system/main/registry/links/links.json}"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
if curl -fsS --max-time 15 "$upstream_url" -o "$scratch/upstream.json" 2> "$scratch/curl.err" \
  && jq -e '.revision' "$scratch/upstream.json" > /dev/null 2>&1; then
  mine="$(jq -r '.revision' "$registry")"
  theirs="$(jq -r '.revision' "$scratch/upstream.json")"
  if [[ $mine -lt $theirs ]]; then
    drift_lines+=("links.json is at revision $mine, design-system's is at revision $theirs: run 'shadcn add -o deanjstone/design-system/links-data'")
  elif [[ $mine -eq $theirs ]] && [[ "$(jq -S . "$registry")" != "$(jq -S . "$scratch/upstream.json")" ]]; then
    drift_lines+=("links.json differs from design-system's at the same revision $mine: edit it in design-system, not here")
  fi
else
  echo "link-check: drift skipped (could not read $upstream_url)"
fi

{
  emit literal "${literal_lines[@]}"
  emit retired "${retired_lines[@]}"
  emit config "${config_lines[@]}"
  emit drift "${drift_lines[@]}"
} > "$scratch/findings.txt"
cat "$scratch/findings.txt"

summary="link-check: summary $repo_name literals=${#literal_lines[@]} retired=${#retired_lines[@]} config=${#config_lines[@]} drift=${#drift_lines[@]} mode=$mode"
echo "$summary"
if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then
  {
    echo "### link-check ($mode)"
    echo
    echo '```'
    cat "$scratch/findings.txt"
    echo "$summary"
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi

if [[ $mode == block ]] && (( ${#literal_lines[@]} + ${#retired_lines[@]} + ${#config_lines[@]} + ${#drift_lines[@]} > 0 )); then
  exit 1
fi
exit 0
