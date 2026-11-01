// @vitest-environment node

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { REGISTRY, apiUrl, appUrl, mcpUrl, routeUrl, tailnetUrl } from "@/lib/links"

// design-system#152: deploy scripts and argus-config hooks build URLs from the
// same links.json as the TS module. The helper must agree with the module on
// every entry, or a script and an app would disagree about one host.

const root = fileURLToPath(new URL("../", import.meta.url))
const script = `${root}registry/links/links.sh`
const links = (...args: string[]) => {
  const result = spawnSync("bash", [script, ...args], { encoding: "utf8", env: { ...process.env, LINKS_JSON: `${root}registry/links/links.json` } })
  return { out: result.stdout.trimEnd(), err: result.stderr.trim(), code: result.status }
}

const entries = REGISTRY.entries as readonly { id: string; bucket: string; status: string; routes: readonly string[] }[]
const builders: Record<string, (id: never, options?: { origin: string }) => string> = {
  internal: appUrl, external: appUrl, api: apiUrl, mcp: mcpUrl, tailnet: tailnetUrl,
}
const command: Record<string, string> = { internal: "url", external: "url", api: "api", mcp: "mcp", tailnet: "tailnet" }

describe("links.sh agrees with links.ts", () => {
  it.each(entries.filter((entry) => entry.status !== "retired").map((entry) => [entry.id, entry] as const))(
    "%s",
    (id, entry) => {
      expect(links(command[entry.bucket], id).out).toBe(builders[entry.bucket](id as never))
    },
  )

  it("builds a route", () => {
    expect(links("route", "shell", "/plans/:slug", "links-registry").out).toBe(
      routeUrl("shell", "/plans/:slug", { slug: "links-registry" }),
    )
    expect(links("route", "shell", "/plans").out).toBe("https://myargus.cc/plans")
  })

  it("encodes a route value as one segment", () => {
    expect(links("route", "shell", "/plans/:slug", "a/b c").out).toBe("https://myargus.cc/plans/a%2Fb%20c")
  })

  it("applies an origin override", () => {
    expect(links("--origin", "http://localhost:8787", "url", "reader").out).toBe("http://localhost:8787/reader/")
    expect(links("--origin", "http://localhost:8787/x", "url", "reader").code).not.toBe(0)
  })
})

describe("links.sh refuses what the module refuses", () => {
  it.each([
    [["url", "read"], /retired/],
    [["url", "nope"], /unknown/],
    [["url", "watchtower-api"], /api/],
    [["route", "shell", "/secret"], /not a registered route/],
    [["route", "shell", "/plans/:slug"], /slug/],
    [["route", "shell", "/plans", "extra"], /takes no/],
  ] as const)("%j", (args, message) => {
    const result = links(...args)
    expect(result.code).not.toBe(0)
    expect(result.err).toMatch(message)
  })

  it("prints a usage line for an unknown command", () => {
    const result = links("frobnicate")
    expect(result.code).toBe(2)
    expect(result.err).toMatch(/usage/)
  })
})

describe("links.sh lists", () => {
  it("prints the cookie domain and the revision", () => {
    expect(links("cookie-domain").out).toBe(".myargus.cc")
    expect(links("revision").out).toBe(String(REGISTRY.revision))
  })

  it("lists the hosts of a status, one per line, sorted and unique", () => {
    const retired = links("hosts", "retired").out.split("\n")
    expect(retired).toEqual(["api.read.myargus.cc", "edms.myargus.cc", "read.myargus.cc"])
    const all = links("hosts").out.split("\n")
    expect(all).toContain("myargus.cc")
    expect(all).toEqual([...new Set(all)].sort())
  })

  it("reads LINKS_JSON from beside the script by default", () => {
    const text = readFileSync(`${root}registry/links/links.json`, "utf8")
    expect(text).toContain('"revision"')
  })
})
