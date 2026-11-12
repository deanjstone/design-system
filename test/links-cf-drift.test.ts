// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
// @ts-expect-error - plain ESM script
import { diffDrift, fetchLive, runDrift } from "../scripts/links/cf-drift.mjs"

// design-system#152, decision 9: the edge is checked, never generated. The
// script reads Cloudflare's live DNS, tunnel ingress and Access apps and prints
// where they disagree with links.json. It must not be able to write.

const registry = JSON.parse(readFileSync(fileURLToPath(new URL("../registry/links/links.json", import.meta.url)), "utf8"))

// What Cloudflare should hold when it matches the registry.
const cleanLive = () => ({
  dns: [
    "myargus.cc", "budget.myargus.cc", "stockade.myargus.cc", "ops.myargus.cc", "mail.myargus.cc",
    "watchtower.myargus.cc", "capture.myargus.cc", "taskview.myargus.cc", "board.myargus.cc",
    "knowledge.myargus.cc", "api.myargus.cc", "mcp.myargus.cc", "memory.myargus.cc",
  ].map((name) => ({ type: "CNAME", name })),
  ingress: ["budget.myargus.cc", "api.myargus.cc", "ops.myargus.cc", "capture.myargus.cc", "taskview.myargus.cc"],
  access: ["ops.myargus.cc", "mail.myargus.cc", "capture.myargus.cc", "taskview.myargus.cc"],
})

describe("diffDrift", () => {
  it("reports nothing when live matches the registry", () => {
    expect(diffDrift(registry, cleanLive())).toEqual([])
  })

  it("reports a live host with no DNS record", () => {
    const live = cleanLive()
    live.dns = live.dns.filter((record: { name: string }) => record.name !== "stockade.myargus.cc")
    expect(diffDrift(registry, live)).toEqual([expect.stringMatching(/^dns: stockade\.myargus\.cc .*no DNS record/)])
  })

  it.each(["read.myargus.cc", "edms.myargus.cc", "api.read.myargus.cc"])("reports DNS for retired %s", (name) => {
    const live = cleanLive()
    live.dns.push({ type: "CNAME", name })
    expect(diffDrift(registry, live)).toEqual([expect.stringMatching(new RegExp(`^dns: ${name.replace(/\./g, "\\.")} .*retired`))])
  })

  it("reports DNS for a planned host, and for a host the registry does not know", () => {
    const live = cleanLive()
    live.dns.push({ type: "A", name: "t3.myargus.cc" }, { type: "CNAME", name: "mystery.myargus.cc" })
    const drift = diffDrift(registry, live)
    expect(drift).toHaveLength(2)
    expect(drift.join("\n")).toMatch(/t3\.myargus\.cc .*planned/)
    expect(drift.join("\n")).toMatch(/mystery\.myargus\.cc .*not in links\.json/)
  })

  it("ignores mail and verification records", () => {
    const live = cleanLive()
    live.dns.push({ type: "MX", name: "myargus.cc" }, { type: "TXT", name: "myargus.cc" }, { type: "CNAME", name: "cf2024-1._domainkey.myargus.cc" })
    expect(diffDrift(registry, live)).toEqual([])
  })

  it("reports tunnel ingress that is missing, or serves a host the registry does not tunnel", () => {
    const live = cleanLive()
    live.ingress = live.ingress.filter((host: string) => host !== "budget.myargus.cc").concat("t3.myargus.cc", "stockade.myargus.cc")
    const drift = diffDrift(registry, live).join("\n")
    expect(drift).toMatch(/tunnel: budget\.myargus\.cc .*no tunnel ingress/)
    expect(drift).toMatch(/tunnel: t3\.myargus\.cc .*planned/)
    expect(drift).toMatch(/tunnel: stockade\.myargus\.cc .*not a tunnel host/)
  })

  it("reports an Access gap in either direction", () => {
    const live = cleanLive()
    live.access = live.access.filter((host: string) => host !== "ops.myargus.cc").concat("budget.myargus.cc")
    const drift = diffDrift(registry, live).join("\n")
    expect(drift).toMatch(/access: ops\.myargus\.cc .*no Access app/)
    expect(drift).toMatch(/access: budget\.myargus\.cc .*not Access-gated/)
  })

  it("reads a path-scoped Access app (a bypass) as its host", () => {
    const live = cleanLive()
    live.access = [...live.access, "taskview.myargus.cc/module"]
    expect(diffDrift(registry, live)).toEqual([])
  })
})

describe("fetchLive", () => {
  const envelope = (result: unknown, extra: object = {}) =>
    new Response(JSON.stringify({ success: true, errors: [], result, ...extra }), { status: 200 })

  function fakeCloudflare() {
    const calls: { url: string; method: string; body: unknown }[] = []
    const fetch = async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body })
      const path = new URL(url).pathname
      if (path === "/client/v4/zones") return envelope([{ id: "zone1" }])
      if (path === "/client/v4/zones/zone1/dns_records") {
        const page = Number(new URL(url).searchParams.get("page"))
        return envelope(page === 1 ? [{ type: "CNAME", name: "a.myargus.cc" }] : [{ type: "A", name: "b.myargus.cc" }], {
          result_info: { total_pages: 2 },
        })
      }
      if (path === "/client/v4/accounts/acct/cfd_tunnel") return envelope([{ id: "tun1" }])
      if (path === "/client/v4/accounts/acct/cfd_tunnel/tun1/configurations") {
        return envelope({ config: { ingress: [{ hostname: "ops.myargus.cc", service: "http://127.0.0.1:3790" }, { service: "http_status:404" }] } })
      }
      if (path === "/client/v4/accounts/acct/access/apps") {
        return envelope([{ domain: "ops.myargus.cc" }, { domain: "x.myargus.cc/p", self_hosted_domains: ["x.myargus.cc/p", "y.myargus.cc"] }], {
          result_info: { total_pages: 1 },
        })
      }
      return new Response("not found", { status: 404 })
    }
    return { calls, fetch }
  }

  it("collects DNS, ingress hostnames and Access domains with GET requests only", async () => {
    const { calls, fetch } = fakeCloudflare()
    const live = await fetchLive({ fetch, token: "t", accountId: "acct", domain: "myargus.cc" })
    expect(live.dns).toEqual([{ type: "CNAME", name: "a.myargus.cc" }, { type: "A", name: "b.myargus.cc" }])
    expect(live.ingress).toEqual(["ops.myargus.cc"])
    expect(live.access.sort()).toEqual(["ops.myargus.cc", "x.myargus.cc/p", "y.myargus.cc"])
    expect(calls.length).toBeGreaterThan(4)
    for (const call of calls) {
      expect(call.method).toBe("GET")
      expect(call.body).toBeUndefined()
    }
  })

  it("explains an API failure without printing the token", async () => {
    const fetch = async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 403 })
    const failure = fetchLive({ fetch, token: "secret-token-value", accountId: "acct", domain: "myargus.cc", zoneId: "z", tunnelId: "t" })
    await expect(failure).rejects.toThrow(/403.*Authentication error/)
    await expect(failure).rejects.not.toThrow(/secret-token-value/)
  })
})

describe("runDrift", () => {
  const live = { dns: [], ingress: [], access: [] }

  it("prints each drift and a count, and exits 1", async () => {
    const lines: string[] = []
    const code = await runDrift({ registry, env: { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" }, fetchLiveState: async () => live, print: (line: string) => lines.push(line) })
    expect(code).toBe(1)
    expect(lines.at(-1)).toMatch(/^cf-drift: \d+ drift\(s\)/)
    expect(lines[0]).toMatch(/^drift /)
  })

  it("exits 0 and says so when nothing drifted", async () => {
    const lines: string[] = []
    const code = await runDrift({ registry, env: { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a" }, fetchLiveState: async () => cleanLive(), print: (line: string) => lines.push(line) })
    expect(code).toBe(0)
    expect(lines).toEqual(["cf-drift: 0 drift(s): live Cloudflare matches links.json"])
  })

  it("exits 2 naming the missing variables", async () => {
    const errors: string[] = []
    const code = await runDrift({ registry, env: {}, fetchLiveState: async () => live, print: () => {}, printError: (line: string) => errors.push(line) })
    expect(code).toBe(2)
    expect(errors.join("\n")).toMatch(/CLOUDFLARE_API_TOKEN.*CLOUDFLARE_ACCOUNT_ID/)
  })
})
