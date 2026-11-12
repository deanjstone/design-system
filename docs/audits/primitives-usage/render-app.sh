#!/usr/bin/env bash
# Serves one app's cached build, renders its screens and stops the server, behind the memory
# gate. One app at a time; nothing is left running.
#
#   docs/audits/primitives-usage/render-app.sh <app> [--only <screen>]
#
# <app> is a directory under screens/ with a config.json; its build is expected at
# ${PRIMITIVES_USAGE_DIST:-~/.cache/primitives-usage/dist}/<app>.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
app="${1:?usage: render-app.sh <app> [--only <screen>]}"
shift
dist="${PRIMITIVES_USAGE_DIST:-$HOME/.cache/primitives-usage/dist}/${app}"
config="${here}/screens/${app}/config.json"
port="$(jq -r '.baseUrl | capture(":(?<port>[0-9]+)$").port' "$config")"
base="$(jq -r '.base // "/"' "$config")"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

"${here}/gate.sh"
node "${here}/serve.mjs" "$dist" "$port" "$base" > /dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true' EXIT
sleep 1
node "${here}/render.mjs" "$config" "$@"
