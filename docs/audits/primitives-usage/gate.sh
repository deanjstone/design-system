#!/usr/bin/env bash
# The memory gate every render, install and full check runs behind on the shared host
# (the 12 Nov 2026 out-of-memory kill): at least 2500 MB available and memory pressure
# (some avg60) under 10. It waits two minutes and looks again, four times, then gives up so the caller can decide.
set -euo pipefail
for attempt in $(seq 1 4); do
  available=$(free -m | awk 'NR==2 {print $7}')
  pressure=$(awk '/^some/ {split($3, parts, "="); print parts[2]}' /proc/pressure/memory)
  if [ "$available" -ge 2500 ] && awk -v p="$pressure" 'BEGIN {exit !(p < 10)}'; then
    echo "gate: ok (available ${available} MB, pressure avg60 ${pressure})"
    exit 0
  fi
  echo "gate: waiting (available ${available} MB, pressure avg60 ${pressure}), attempt ${attempt}" >&2
  sleep 120
done
echo "gate: gave up after eight minutes; run it again" >&2
exit 1
