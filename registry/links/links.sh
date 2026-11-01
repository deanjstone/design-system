#!/usr/bin/env bash
# link-check:vendored
# Build a myargus.cc or tailnet URL from links.json, for deploy scripts and hooks.
# The bash twin of the links.ts builders (design-system ADR-0004): same registry,
# same canonical forms (decision 4), so a script and an app never disagree.
#
#   links.sh [--origin <origin>] url <id>             app root, ends in "/"
#   links.sh [--origin <origin>] route <id> </path/:param> [value...]
#   links.sh [--origin <origin>] api <id>             API base, no trailing slash
#   links.sh [--origin <origin>] mcp <id>             MCP base, no trailing slash
#   links.sh [--origin <origin>] tailnet <id>         tailnet service root, ends in "/"
#   links.sh cookie-domain | revision
#   links.sh hosts [live|planned|redirect|retired]    hosts, sorted, one per line
#
# --origin swaps scheme, host and port for a local or preview run. Read it from
# one env var per deployment (decision 5); never write a fallback host here.
# links.json is found at $LINKS_JSON, else in the script's parent directory
# (scripts/../links.json), else beside the script. Needs jq. Shipped by the design-system `links-sh` registry item.
set -euo pipefail

usage() {
  echo "usage: links.sh [--origin <origin>] url|api|mcp|tailnet <id> | route <id> <path> [value...] | cookie-domain | revision | hosts [status]" >&2
  exit 2
}
die() {
  echo "links.sh: $*" >&2
  exit 1
}

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
registry="${LINKS_JSON:-}"
if [[ -z $registry ]]; then
  for candidate in "$here/../links.json" "$here/links.json"; do
    [[ -f $candidate ]] && registry="$candidate" && break
  done
fi
[[ -f $registry ]] || die "links.json not found (set LINKS_JSON)"
command -v jq > /dev/null || die "jq is required"

origin=""
if [[ ${1:-} == "--origin" ]]; then
  [[ $# -ge 2 ]] || usage
  origin="$2"
  shift 2
  [[ $origin =~ ^https?://[^/?#]+/?$ ]] || die "origin $origin must be http(s)://host[:port] with no path"
  origin="${origin%/}"
fi

[[ $# -ge 1 ]] || usage
command_name="$1"
shift

# Resolve an id to its entry as JSON, following one redirect and refusing a
# retired entry or the wrong bucket. Arguments: builder id bucket...
load_entry() {
  local builder="$1" id="$2" buckets out
  shift 2
  buckets="$(printf '%s\n' "$@" | jq -R . | jq -sc .)"
  if ! out="$(jq -ec --arg id "$id" --argjson buckets "$buckets" '
    def named($x): .entries | map(select(.id == $x)) | first;
    named($id) as $found
    | if $found == null then error("unknown link id \($id)") else . end
    | (if $found.status == "redirect" then named($found.redirect) else $found end) as $entry
    | if $entry.status == "retired" then error("\($entry.id) is retired; remove the reference")
      elif ($buckets | index($entry.bucket)) == null then
        error("\($entry.id) is a \($entry.bucket) entry; use \({internal:"url",external:"url",api:"api",mcp:"mcp",tailnet:"tailnet"}[$entry.bucket])")
      else $entry end' "$registry" 2>&1)"; then
    out="${out#jq: error (at * *): }"
    out="${out#jq: error (at *): }"
    die "$builder: ${out%% (at *}"
  fi
  printf '%s' "$out"
}

origin_of() { # entry-json
  if [[ -n $origin ]]; then
    printf '%s' "$origin"
  else
    jq -r --slurpfile reg "$registry" '
      if .bucket == "tailnet" then "https://\($reg[0].tailnetHost):\(.port)" else "https://\(.host)" end' <<< "$1"
  fi
}

mount_of() { # entry-json: the path with no trailing slash
  jq -r '(.path // "") | sub("/+$"; "")' <<< "$1"
}

case "$command_name" in
  url)
    [[ $# -eq 1 ]] || usage
    entry="$(load_entry url "$1" internal external)"
    printf '%s%s/\n' "$(origin_of "$entry")" "$(mount_of "$entry")"
    ;;
  api | mcp)
    [[ $# -eq 1 ]] || usage
    entry="$(load_entry "$command_name" "$1" "$command_name")"
    printf '%s%s\n' "$(origin_of "$entry")" "$(mount_of "$entry")"
    ;;
  tailnet)
    [[ $# -eq 1 ]] || usage
    entry="$(load_entry tailnet "$1" tailnet)"
    printf '%s/\n' "$(origin_of "$entry")"
    ;;
  route)
    [[ $# -ge 2 ]] || usage
    id="$1" path="$2"
    shift 2
    entry="$(load_entry route "$id" internal external)"
    jq -e --arg path "$path" '.routes | index($path) != null' <<< "$entry" > /dev/null \
      || die "$path is not a registered route of $id; add it to links.json"
    mapfile -t names < <(grep -oE ':[A-Za-z][A-Za-z0-9]*' <<< "$path" | cut -c2- || true)
    if [[ $# -lt ${#names[@]} ]]; then die "$path needs the parameter ${names[$#]}"; fi
    if [[ $# -gt ${#names[@]} ]]; then die "$path takes no parameter beyond ${#names[@]}"; fi
    filled="$path"
    values=("$@")
    for index in "${!names[@]}"; do
      value="$(jq -rn --arg v "${values[$index]}" '$v | @uri')"
      filled="${filled/:${names[$index]}/$value}"
    done
    printf '%s%s%s\n' "$(origin_of "$entry")" "$(mount_of "$entry")" "$filled"
    ;;
  cookie-domain) jq -r '.cookieDomain' "$registry" ;;
  revision) jq -r '.revision' "$registry" ;;
  hosts)
    status="${1:-}"
    jq -r --arg status "$status" '
      [.entries[] | select(.host != null and ($status == "" or .status == $status)) | .host]
      | unique | .[]' "$registry"
    ;;
  *) usage ;;
esac
