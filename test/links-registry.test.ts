// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
// @ts-expect-error - plain ESM script, shared with the generator and the CLI
import { BUCKETS, STATUSES, validateRegistry } from "../scripts/links/registry.mjs"

// design-system#152: links.json is the one place a myargus.cc or tailnet URL
// is written down. A malformed entry would ship a wrong URL to every consumer,
// so the shape is checked here, not discovered at a builder call.

const root = new URL("../", import.meta.url)
const readJson = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(path, root)), "utf8"))
const registry = readJson("registry/links/links.json")

type Entry = Record<string, unknown>
const withEntry = (patch: Entry, id = "reader") => ({
  ...registry,
  entries: registry.entries.map((entry: Entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
})
const errorsFor = (data: unknown) => validateRegistry(data) as string[]

describe("registry/links/links.json", () => {
  it("is valid", () => {
    expect(errorsFor(registry)).toEqual([])
  })

  it("covers every host the charting findings name", () => {
    const hosts = new Set(registry.entries.map((entry: Entry) => entry.host).filter(Boolean))
    for (const host of [
      "myargus.cc", "budget.myargus.cc", "stockade.myargus.cc", "ops.myargus.cc", "mail.myargus.cc",
      "watchtower.myargus.cc", "capture.myargus.cc", "taskview.myargus.cc", "t3.myargus.cc", "atto1.myargus.cc",
      "board.myargus.cc", "knowledge.myargus.cc", "read.myargus.cc", "edms.myargus.cc", "api.read.myargus.cc",
      "api.myargus.cc", "mcp.myargus.cc", "memory.myargus.cc", "vault.myargus.cc",
    ]) {
      expect(hosts, host).toContain(host)
    }
  })

  it("gives decision 8's statuses to the hosts it names", () => {
    const status = (id: string) => registry.entries.find((entry: Entry) => entry.id === id).status
    expect(["read", "reader-api-host", "edms"].map(status)).toEqual(["retired", "retired", "retired"])
    expect(["knowledge-host", "board"].map(status)).toEqual(["redirect", "redirect"])
    expect(["t3", "atto1"].map(status)).toEqual(["planned", "planned"])
  })

  it("keeps the schema's enums equal to the validator's", () => {
    const schema = readJson("registry/links/links.schema.json")
    const entry = schema.properties.entries.items.properties
    expect(entry.bucket.enum).toEqual(BUCKETS)
    expect(entry.status.enum).toEqual(STATUSES)
  })
})

describe("validateRegistry", () => {
  it.each([
    ["an unknown bucket", { bucket: "sideways" }, /bucket/],
    ["an unknown status", { status: "maybe" }, /status/],
    ["an internal app on another host", { host: "reader.myargus.cc" }, /internal.*myargus\.cc/],
    ["an internal root without a trailing slash", { path: "/reader" }, /root path/],
    ["a route with a trailing slash", { routes: ["/plans/"] }, /route/],
    ["a probe on a retired host", { status: "retired", probe: { status: 200 } }, /probe/],
    ["a redirect with no target", { status: "redirect" }, /redirect/],
    ["a redirect target that does not exist", { status: "redirect", redirect: "nowhere" }, /redirect/],
    ["a switcher entry that is not live", { status: "planned", switcher: true, probe: null }, /switcher/],
    ["a duplicate id", { id: "shell" }, /duplicate id/],
  ])("rejects %s", (_name, patch, message) => {
    expect(errorsFor(withEntry(patch as Entry)).join("\n")).toMatch(message)
  })

  it("rejects an external app that is not <label>.<domain>", () => {
    expect(errorsFor(withEntry({ host: "budget.example.com" }, "budget")).join("\n")).toMatch(/external/)
  })

  it("rejects an API base with a trailing slash", () => {
    expect(errorsFor(withEntry({ path: "/watchtower/" }, "watchtower-api")).join("\n")).toMatch(/api.*path/)
  })

  it("rejects a tailnet entry without a port, or with a host", () => {
    expect(errorsFor(withEntry({ port: undefined }, "loop-state")).join("\n")).toMatch(/port/)
    expect(errorsFor(withEntry({ host: "x.example.com" }, "loop-state")).join("\n")).toMatch(/tailnet.*host/)
  })

  it("accepts an MCP entry on a legacy host only when it names its mcp.<domain> target", () => {
    expect(errorsFor(withEntry({ moveTo: undefined }, "memory")).join("\n")).toMatch(/mcp.*moveTo/)
    expect(errorsFor(withEntry({ moveTo: { host: "mcp.myargus.cc", path: "/memory/" } }, "memory")).join("\n")).toMatch(/moveTo/)
  })

  it("rejects two entries at one host and path", () => {
    expect(errorsFor(withEntry({ id: "reader2" }, "reader")).join("\n")).toEqual("")
    const doubled = { ...registry, entries: [...registry.entries, { ...registry.entries[1], id: "reader-copy" }] }
    expect(errorsFor(doubled).join("\n")).toMatch(/same host and path/)
  })

  it("rejects a cookie domain that is not the registry domain with a dot", () => {
    expect(errorsFor({ ...registry, cookieDomain: "myargus.cc" }).join("\n")).toMatch(/cookieDomain/)
  })
})
