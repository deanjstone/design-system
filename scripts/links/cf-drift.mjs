#!/usr/bin/env node
// Read-only Cloudflare drift check (design-system#152, decision 9).
//
// Diffs live DNS, tunnel ingress and Access apps against registry/links/links.json
// and prints the drift. It writes nothing: every request is a GET, and the token
// only needs these read permissions:
//   Zone > DNS > Read, Zone > Zone > Read,
//   Account > Cloudflare Tunnel > Read, Account > Access: Apps and Policies > Read
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/links/cf-drift.mjs
//
// Optional: CLOUDFLARE_ZONE_ID and CLOUDFLARE_TUNNEL_ID (looked up when unset; the
// tunnel lookup needs exactly one tunnel in the account).
// Exit 0: no drift. 1: drift printed. 2: could not run.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { validateRegistry } from "./registry.mjs"

const API = "https://api.cloudflare.com/client/v4"

const hostOf = (domainField) => domainField.replace(/^[a-z]+:\/\//i, "").split("/")[0].toLowerCase()

export function diffDrift(registry, live) {
  const { domain } = registry
  const drift = []
  const isOurs = (host) => host === domain || host.endsWith(`.${domain}`)

  const entriesByHost = new Map()
  for (const entry of registry.entries) {
    if (!entry.host) continue
    if (!entriesByHost.has(entry.host)) entriesByHost.set(entry.host, [])
    entriesByHost.get(entry.host).push(entry)
  }
  const statusOf = (host) => {
    const entries = entriesByHost.get(host)
    if (!entries) return "unknown"
    for (const wanted of ["live", "redirect", "planned"]) {
      if (entries.some((entry) => entry.status === wanted)) return wanted
    }
    return "retired"
  }
  const tunnelled = (host) => (entriesByHost.get(host) ?? []).some((entry) => entry.hosting === "tunnel" && entry.status === "live")
  const gated = (host) => (entriesByHost.get(host) ?? []).some((entry) => entry.access && entry.status === "live")

  const dnsHosts = new Set(
    live.dns
      .filter((record) => ["A", "AAAA", "CNAME"].includes(record.type))
      .map((record) => record.name.toLowerCase())
      .filter((name) => isOurs(name) && !name.includes("_")),
  )
  for (const host of [...entriesByHost.keys()].sort()) {
    const status = statusOf(host)
    if ((status === "live" || status === "redirect") && !dnsHosts.has(host)) {
      drift.push(`dns: ${host} is ${status} in links.json but has no DNS record`)
    }
  }
  for (const host of [...dnsHosts].sort()) {
    const status = statusOf(host)
    if (status === "retired") drift.push(`dns: ${host} is retired in links.json but still has a DNS record`)
    else if (status === "planned") drift.push(`dns: ${host} is planned in links.json but already has a DNS record`)
    else if (status === "unknown") drift.push(`dns: ${host} has a DNS record but is not in links.json`)
  }

  const ingress = new Set(live.ingress.map((host) => host.toLowerCase()).filter(isOurs))
  for (const host of [...entriesByHost.keys()].sort()) {
    if (tunnelled(host) && !ingress.has(host)) drift.push(`tunnel: ${host} is a live tunnel host in links.json but has no tunnel ingress`)
  }
  for (const host of [...ingress].sort()) {
    const status = statusOf(host)
    if (status === "retired") drift.push(`tunnel: ${host} is retired in links.json but still has tunnel ingress`)
    else if (status === "planned") drift.push(`tunnel: ${host} is planned in links.json but already has tunnel ingress`)
    else if (status === "unknown") drift.push(`tunnel: ${host} has tunnel ingress but is not in links.json`)
    else if (!tunnelled(host)) drift.push(`tunnel: ${host} has tunnel ingress but is not a tunnel host in links.json`)
  }

  const access = new Set(live.access.map(hostOf).filter(isOurs))
  for (const host of [...entriesByHost.keys()].sort()) {
    if (gated(host) && !access.has(host)) drift.push(`access: ${host} is Access-gated in links.json but has no Access app`)
  }
  for (const host of [...access].sort()) {
    const status = statusOf(host)
    if (status === "unknown") drift.push(`access: ${host} has an Access app but is not in links.json`)
    else if (status === "retired") drift.push(`access: ${host} is retired in links.json but still has an Access app`)
    else if (!gated(host) && status !== "planned") drift.push(`access: ${host} has an Access app but links.json says it is not Access-gated`)
  }
  return drift
}

// Every request below is a GET. There is no other method in this file.
export async function fetchLive({ fetch: fetchImpl = fetch, token, accountId, domain, zoneId, tunnelId }) {
  const get = async (path, params = {}) => {
    const url = new URL(`${API}${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
    const response = await fetchImpl(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${token}` } })
    let body
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    if (!response.ok || body?.success === false) {
      const messages = (body?.errors ?? []).map((error) => error.message).join("; ")
      throw new Error(`Cloudflare GET ${path} failed: ${response.status}${messages ? ` ${messages}` : ""}`)
    }
    return body
  }
  const paged = async (path, params = {}) => {
    const results = []
    for (let page = 1; ; page += 1) {
      const body = await get(path, { ...params, page, per_page: 100 })
      results.push(...body.result)
      if (page >= (body.result_info?.total_pages ?? 1)) return results
    }
  }

  const zone = zoneId ?? (await get("/zones", { name: domain })).result[0]?.id
  if (!zone) throw new Error(`Cloudflare has no zone named ${domain} for this token`)
  let tunnel = tunnelId
  if (!tunnel) {
    const tunnels = (await get(`/accounts/${accountId}/cfd_tunnel`, { is_deleted: false })).result
    if (tunnels.length !== 1) throw new Error(`the account has ${tunnels.length} tunnels; set CLOUDFLARE_TUNNEL_ID`)
    tunnel = tunnels[0].id
  }

  const dns = (await paged(`/zones/${zone}/dns_records`)).map(({ type, name }) => ({ type, name }))
  const configuration = await get(`/accounts/${accountId}/cfd_tunnel/${tunnel}/configurations`)
  const ingress = (configuration.result?.config?.ingress ?? []).map((rule) => rule.hostname).filter(Boolean)
  const apps = await paged(`/accounts/${accountId}/access/apps`)
  const access = apps.flatMap((app) => [app.domain, ...(app.self_hosted_domains ?? [])]).filter(Boolean)
  return { dns, ingress, access: [...new Set(access)] }
}

export async function runDrift({ registry, env, fetchLiveState, print = console.log, printError = console.error }) {
  const token = env.CLOUDFLARE_API_TOKEN
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  if (!token || !accountId) {
    printError("cf-drift: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (a read-only token; see the header of this script)")
    return 2
  }
  const errors = validateRegistry(registry)
  if (errors.length > 0) {
    printError(`cf-drift: links.json is invalid:\n- ${errors.join("\n- ")}`)
    return 2
  }
  let live
  try {
    live = await (fetchLiveState ?? fetchLive)({
      token,
      accountId,
      domain: registry.domain,
      zoneId: env.CLOUDFLARE_ZONE_ID,
      tunnelId: env.CLOUDFLARE_TUNNEL_ID,
    })
  } catch (error) {
    printError(`cf-drift: ${error.message}`)
    return 2
  }
  const drift = diffDrift(registry, live)
  for (const line of drift) print(`drift ${line}`)
  print(drift.length === 0
    ? "cf-drift: 0 drift(s): live Cloudflare matches links.json"
    : `cf-drift: ${drift.length} drift(s) between live Cloudflare and links.json`)
  return drift.length === 0 ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const registry = JSON.parse(readFileSync(new URL("../../registry/links/links.json", import.meta.url), "utf8"))
  process.exitCode = await runDrift({ registry, env: process.env })
}
