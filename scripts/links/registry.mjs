// The semantic rules for registry/links/links.json (design-system#152, ADR-0004).
// Shared by the generator, the tests and the Cloudflare drift script. No
// dependencies: a JSON Schema validator would be a new package for a file this
// small. links.schema.json is the editor-facing contract; a test keeps its
// enums equal to the ones below.

export const BUCKETS = ["internal", "external", "api", "mcp", "tailnet"]
export const STATUSES = ["live", "planned", "redirect", "retired"]
export const HOSTINGS = ["pages", "worker", "tunnel", "tailnet"]

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const LABEL = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ROUTE = /^(\/[A-Za-z0-9._~-]+|\/:[A-Za-z][A-Za-z0-9]*)+$/
const BASE_PATH = /^\/[a-z0-9]+(-[a-z0-9]+)*$/
const INTERNAL_ROOT = /^\/([a-z0-9]+(-[a-z0-9]+)*\/)?$/

export function validateRegistry(data) {
  const errors = []
  const fail = (message) => errors.push(message)

  if (typeof data !== "object" || data === null) return ["registry is not an object"]
  if (!Number.isInteger(data.revision) || data.revision < 1) fail("revision must be a positive integer")
  const { domain, cookieDomain, tailnetHost, entries } = data
  if (typeof domain !== "string" || !domain.includes(".")) fail("domain must be a bare domain such as example.com")
  if (cookieDomain !== `.${domain}`) fail(`cookieDomain must be "." plus domain (".${domain}")`)
  if (typeof tailnetHost !== "string" || !tailnetHost.endsWith(".ts.net")) fail("tailnetHost must be a *.ts.net name")
  if (!Array.isArray(entries) || entries.length === 0) return [...errors, "entries must be a non-empty array"]

  const ids = new Set()
  const locations = new Map()
  for (const entry of entries) {
    const label = `entry ${entry?.id ?? "?"}`
    const bad = (message) => fail(`${label}: ${message}`)

    if (typeof entry.id !== "string" || !ID.test(entry.id)) bad("id must be kebab-case")
    if (ids.has(entry.id)) bad(`duplicate id ${entry.id}`)
    ids.add(entry.id)
    if (!BUCKETS.includes(entry.bucket)) bad(`bucket must be one of ${BUCKETS.join(", ")}`)
    if (!STATUSES.includes(entry.status)) bad(`status must be one of ${STATUSES.join(", ")}`)
    if (!HOSTINGS.includes(entry.hosting)) bad(`hosting must be one of ${HOSTINGS.join(", ")}`)
    for (const flag of ["access", "switcher"]) {
      if (typeof entry[flag] !== "boolean") bad(`${flag} must be a boolean`)
    }
    if (typeof entry.name !== "string" || entry.name === "") bad("name must be a non-empty string")

    const retired = entry.status === "retired"
    switch (entry.bucket) {
      case "internal":
        if (entry.host !== domain) bad(`internal apps live on ${domain}`)
        if (typeof entry.path !== "string" || !INTERNAL_ROOT.test(entry.path)) {
          bad('internal root path must be "/" or "/<app>/" with a trailing slash')
        }
        break
      case "external": {
        const label0 = typeof entry.host === "string" ? entry.host.slice(0, -domain.length - 1) : ""
        if (!entry.host?.endsWith(`.${domain}`) || !LABEL.test(label0)) bad(`external apps live on <app>.${domain}`)
        if (entry.path !== "/") bad('external root path must be "/"')
        break
      }
      case "api":
        if (!entry.host?.endsWith(`.${domain}`)) bad(`api host must be under ${domain}`)
        if (!retired && (entry.host !== `api.${domain}` || !BASE_PATH.test(entry.path ?? ""))) {
          bad(`api path must be /<app> with no trailing slash, on api.${domain}`)
        }
        break
      case "mcp":
        if (!entry.host?.endsWith(`.${domain}`)) bad(`mcp host must be under ${domain}`)
        if (entry.moveTo === undefined) {
          if (entry.host !== `mcp.${domain}` || !BASE_PATH.test(entry.path ?? "")) {
            bad(`mcp entries sit at mcp.${domain}/<app> or name that target in moveTo`)
          }
        } else if (entry.moveTo.host !== `mcp.${domain}` || !BASE_PATH.test(entry.moveTo.path ?? "")) {
          bad(`moveTo must be mcp.${domain}/<app> with no trailing slash`)
        }
        break
      case "tailnet":
        if (entry.host !== undefined) bad("a tailnet entry takes its host from tailnetHost; remove host")
        if (!Number.isInteger(entry.port) || entry.port < 1 || entry.port > 65535) bad("tailnet port must be 1-65535")
        break
    }
    if (entry.moveTo !== undefined && entry.bucket !== "mcp") bad("moveTo is only for mcp entries")

    if (!Array.isArray(entry.routes)) bad("routes must be an array")
    else {
      if (entry.routes.length > 0 && !["internal", "external"].includes(entry.bucket)) bad("only app entries have routes")
      if (retired && entry.routes.length > 0) bad("a retired entry has no routes")
      for (const route of entry.routes) {
        if (typeof route !== "string" || !ROUTE.test(route)) {
          bad(`route ${JSON.stringify(route)} must start with / and have no trailing slash`)
        }
      }
    }

    if (entry.probe !== null && !(Number.isInteger(entry.probe?.status) && entry.probe.status >= 100 && entry.probe.status <= 599)) {
      bad("probe must be null or { status: <HTTP status> }")
    }
    if ((entry.status === "planned" || retired) && entry.probe !== null) bad("a planned or retired entry has no probe")

    if (entry.status === "redirect") {
      if (typeof entry.redirect !== "string") bad("a redirect entry names its target in redirect")
    } else if (entry.redirect !== undefined) bad("redirect is only for status redirect")
    if (entry.switcher === true && entry.status !== "live") bad("only a live entry can be in the switcher")

    if (entry.bucket !== "tailnet") {
      const where = `${entry.host}${entry.path}`
      if (locations.has(where)) bad(`${locations.get(where)} and ${entry.id} share the same host and path ${where}`)
      locations.set(where, entry.id)
    }
  }

  for (const entry of entries) {
    if (entry.status !== "redirect" || typeof entry.redirect !== "string") continue
    const target = entries.find((candidate) => candidate.id === entry.redirect)
    if (!target) fail(`entry ${entry.id}: redirect target ${entry.redirect} does not exist`)
    else if (target.status === "retired" || target.status === "redirect") {
      fail(`entry ${entry.id}: redirect target ${entry.redirect} must be live or planned`)
    }
  }
  return errors
}
