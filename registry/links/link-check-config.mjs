#!/usr/bin/env node
// link-check:vendored
// The config half of link-check (design-system ADR-0004, decision 6b): the host
// and path settings kept in git must agree with links.json. It reads NUL
// separated file names on stdin (link-check.sh passes `git ls-files`) and prints
// one finding per line as `<path>:<line>: <message>`. It prints nothing when
// everything agrees, and always exits 0 unless it cannot run.
//
// Checked: Vite `base`, router `basename`, web manifest `start_url` and `scope`,
// host and path in wrangler config, and the hosts a Pages `_redirects` file
// sends traffic to. The checks are textual, so they catch the common slips, not
// every spelling of a setting.
import { readFileSync } from "node:fs"
import { basename } from "node:path"

const registry = JSON.parse(readFileSync(process.argv[2], "utf8"))
const files = readFileSync(0, "utf8").split("\0").filter(Boolean)
const { domain } = registry

const mountOf = (path) => (path ?? "").replace(/\/+$/, "")
const locations = new Map() // host -> [{ id, status, mount }]
const addLocation = (host, path, entry) => {
  if (!locations.has(host)) locations.set(host, [])
  locations.get(host).push({ id: entry.id, status: entry.status, mount: mountOf(path) })
}
for (const entry of registry.entries) {
  if (entry.host) addLocation(entry.host, entry.path, entry)
  if (entry.moveTo) addLocation(entry.moveTo.host, entry.moveTo.path, entry)
}
const internalRoots = new Set(registry.entries.filter((entry) => entry.bucket === "internal" && entry.status !== "retired").map((entry) => entry.path))

const findings = []
const lineOf = (text, index) => text.slice(0, index).split("\n").length
const report = (path, line, message) => findings.push(`${path}:${line}: ${message}`)

// Is host + path a place the registry knows? Returns a message when it is not.
function checkLocation(host, path) {
  if (host !== domain && !host.endsWith(`.${domain}`)) return null
  const known = locations.get(host)
  if (!known) return `${host} is not in links.json`
  if (known.every((place) => place.status === "retired")) return `${host} is retired in links.json`
  const live = known.filter((place) => place.status !== "retired")
  if (live.length === 1) return null // a host of its own: any path on it is that app's
  const wanted = mountOf(path.replace(/\*+$/, ""))
  const covered = live.some((place) => wanted === place.mount || wanted.startsWith(`${place.mount}/`))
  return covered ? null : `${host}${wanted === "" ? "/" : wanted} is not a path links.json registers on that host`
}

function checkUrlLike(path, text, index, token) {
  const bare = token.replace(/^[a-z]+:\/\//i, "")
  const slash = bare.indexOf("/")
  const host = (slash === -1 ? bare : bare.slice(0, slash)).replace(/:\d+$/, "")
  const urlPath = slash === -1 ? "" : bare.slice(slash)
  const message = checkLocation(host, urlPath)
  if (message) report(path, lineOf(text, index), message)
}

const domainPattern = domain.replace(/\./g, "\\.")

for (const path of files) {
  const name = basename(path)
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch {
    continue
  }

  if (/^vite\.config\.(ts|js|mjs|mts|cjs|cts)$/.test(name)) {
    for (const match of text.matchAll(/\bbase\s*:\s*(['"`])([^'"`]*)\1/g)) {
      const base = match[2]
      if (base !== "/" && !internalRoots.has(base)) {
        report(path, lineOf(text, match.index), `Vite base ${JSON.stringify(base)} is not an internal app root in links.json`)
      }
    }
  }

  if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && text.includes("basename")) {
    for (const match of text.matchAll(/\bbasename\s*[=:]\s*\{?\s*(['"`])(\/[^'"`]*)\1/g)) {
      const value = match[2]
      const root = value.endsWith("/") ? value : `${value}/`
      if (value !== "/" && !internalRoots.has(root)) {
        report(path, lineOf(text, match.index), `router basename ${JSON.stringify(value)} is not an internal app root in links.json`)
      }
    }
  }

  if (name === "manifest.webmanifest" || name === "manifest.json") {
    let manifest
    try {
      manifest = JSON.parse(text)
    } catch {
      continue
    }
    if (typeof manifest !== "object" || manifest === null || (manifest.start_url === undefined && manifest.scope === undefined)) continue
    for (const key of ["start_url", "scope"]) {
      const value = manifest[key]
      if (typeof value !== "string" || !value.startsWith("/")) continue
      if (value !== "/" && !internalRoots.has(value)) {
        report(path, 1, `manifest ${key} ${JSON.stringify(value)} is not an internal app root in links.json`)
      }
    }
    if (typeof manifest.start_url === "string" && typeof manifest.scope === "string"
      && manifest.start_url.startsWith("/") && manifest.scope.startsWith("/")
      && !manifest.start_url.startsWith(manifest.scope)) {
      report(path, 1, `manifest start_url ${JSON.stringify(manifest.start_url)} is outside its scope ${JSON.stringify(manifest.scope)}`)
    }
  }

  if (/^wrangler\.(toml|json|jsonc)$/.test(name)) {
    const pattern = new RegExp(`(zone_name\\s*["']?\\s*[=:]\\s*)?["']([^"'\\s]*${domainPattern}[^"'\\s]*)["']`, "g")
    for (const match of text.matchAll(pattern)) {
      if (match[1]) continue
      checkUrlLike(path, text, match.index, match[2])
    }
  }

  if (name === "_redirects") {
    const pattern = new RegExp(`https?://([A-Za-z0-9.*-]*${domainPattern})([^\\s]*)`, "g")
    for (const match of text.matchAll(pattern)) {
      checkUrlLike(path, text, match.index, `${match[1]}${match[2]}`)
    }
  }
}

if (findings.length > 0) process.stdout.write(`${findings.join("\n")}\n`)
