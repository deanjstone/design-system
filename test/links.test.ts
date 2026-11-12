// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { COOKIE_DOMAIN, REGISTRY, apiUrl, appUrl, mcpUrl, routeUrl, switcherApps, tailnetUrl } from "@/lib/links"
import { LinkError, createLinks } from "@/lib/links-core"
// @ts-expect-error - plain ESM script
import { renderLinksModule } from "../scripts/links/generate.mjs"

// design-system#152, decision 4: https only, no www, app roots end in "/",
// in-app routes have no trailing slash, API and MCP bases have no slash,
// builders join with exactly one "/".

const root = new URL("../", import.meta.url)
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), "utf8")

describe("registry/lib/links.ts is generated from links.json", () => {
  it("matches what the generator renders now", () => {
    expect(read("registry/lib/links.ts")).toBe(renderLinksModule(JSON.parse(read("registry/links/links.json"))))
  })
})

describe("the vendored marker", () => {
  it("is code, because shadcn strips comments from an installed file", () => {
    const code = read("registry/lib/links.ts")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .slice(0, 10)
      .join("\n")
    expect(code).toContain("link-check:vendored")
  })
})

describe("appUrl", () => {
  it("ends an external app's root in a slash", () => {
    expect(appUrl("ops")).toBe("https://ops.myargus.cc/")
    expect(appUrl("budget")).toBe("https://budget.myargus.cc/")
  })

  it("ends an internal app's root in a slash", () => {
    expect(appUrl("reader")).toBe("https://myargus.cc/reader/")
    expect(appUrl("shell")).toBe("https://myargus.cc/")
  })

  it("follows a redirect entry to its target", () => {
    expect(appUrl("board")).toBe("https://ops.myargus.cc/")
    expect(appUrl("knowledge-host")).toBe("https://myargus.cc/knowledge/")
  })

  it("builds a planned app, so code can be written before the host exists", () => {
    expect(appUrl("atto1")).toBe("https://atto1.myargus.cc/")
  })

  it("refuses a retired host", () => {
    expect(() => appUrl("read")).toThrow(/retired/)
  })

  it("refuses an id of another bucket", () => {
    expect(() => appUrl("watchtower-api" as never)).toThrow(/apiUrl/)
  })

  it("refuses an id the registry does not hold", () => {
    expect(() => appUrl("nope" as never)).toThrow(LinkError)
  })
})

describe("routeUrl", () => {
  it("joins an in-app route to the app root with exactly one slash", () => {
    expect(routeUrl("shell", "/plans")).toBe("https://myargus.cc/plans")
    expect(routeUrl("shell", "/plans/:slug", { slug: "links-registry" })).toBe("https://myargus.cc/plans/links-registry")
  })

  it("joins to an internal app under its path, without doubling the slash", () => {
    const links = createLinks({
      ...REGISTRY,
      entries: REGISTRY.entries.map((entry) => (entry.id === "reader" ? { ...entry, routes: ["/article/:id"] } : entry)),
    } as never)
    expect(links.routeUrl("reader", "/article/:id", { id: "42" })).toBe("https://myargus.cc/reader/article/42")
  })

  it("encodes each parameter as one path segment", () => {
    expect(routeUrl("shell", "/plans/:slug", { slug: "a/b c" })).toBe("https://myargus.cc/plans/a%2Fb%20c")
  })

  it("throws for a route the registry does not list", () => {
    expect(() => routeUrl("shell", "/secret" as never)).toThrow(/not a registered route/)
  })

  it("throws for a missing or an unused parameter", () => {
    expect(() => routeUrl("shell", "/plans/:slug")).toThrow(/slug/)
    expect(() => routeUrl("shell", "/plans", { extra: "x" })).toThrow(/extra/)
  })
})

describe("apiUrl and mcpUrl", () => {
  it("have no trailing slash", () => {
    expect(apiUrl("watchtower-api")).toBe("https://api.myargus.cc/watchtower")
    expect(mcpUrl("email-mcp")).toBe("https://mcp.myargus.cc/email")
  })

  it("emit an MCP server's current location until its host moves (decision 7)", () => {
    expect(mcpUrl("memory")).toBe("https://memory.myargus.cc/mcp")
  })

  it("refuse the wrong kind of id", () => {
    expect(() => apiUrl("ops" as never)).toThrow(/appUrl/)
    expect(() => mcpUrl("watchtower-api" as never)).toThrow(/apiUrl/)
  })
})

describe("tailnetUrl", () => {
  it("builds https://<tailnet host>:<port>/", () => {
    expect(tailnetUrl("t3-tailnet")).toBe("https://homelab.tail00500e.ts.net:3773/")
    expect(tailnetUrl("loop-state")).toBe("https://homelab.tail00500e.ts.net:3791/")
  })
})

describe("origin override (decision 5)", () => {
  it("swaps only the origin, keeping the path and the slash rules", () => {
    const origin = "http://localhost:5173"
    expect(appUrl("reader", { origin })).toBe("http://localhost:5173/reader/")
    expect(routeUrl("shell", "/plans/:slug", { slug: "x" }, { origin })).toBe("http://localhost:5173/plans/x")
    expect(apiUrl("watchtower-api", { origin: "http://127.0.0.1:8787" })).toBe("http://127.0.0.1:8787/watchtower")
    expect(tailnetUrl("loop-state", { origin: "http://localhost:3791" })).toBe("http://localhost:3791/")
  })

  it("accepts a trailing slash on the origin", () => {
    expect(appUrl("ops", { origin: "https://preview.example.dev/" })).toBe("https://preview.example.dev/")
  })

  it.each(["", "localhost:5173", "ftp://example.com", "https://example.com/app", "https://example.com/?x=1"])(
    "rejects %j as an origin",
    (origin) => {
      expect(() => appUrl("ops", { origin })).toThrow(/origin/)
    },
  )
})

describe("switcherApps", () => {
  it("lists the live switcher apps once each, with canonical hrefs", () => {
    const apps = switcherApps("reader")
    expect(apps.map((app) => app.id)).toEqual([
      "shell", "reader", "knowledge", "briefings", "jobs", "budget", "stockade", "ops", "mail", "watchtower",
    ])
    expect(apps.find((app) => app.id === "reader")).toMatchObject({
      name: "Read",
      href: "https://myargus.cc/reader/",
      description: "Read-later & article library",
    })
  })

  it("never lists a planned, redirect or retired app", () => {
    const ids = switcherApps("shell").map((app) => app.id)
    for (const id of ["atto1", "t3", "board", "knowledge-host", "read"]) expect(ids).not.toContain(id)
  })

  it("marks the current app", () => {
    expect(switcherApps("ops").filter((app) => app.current).map((app) => app.id)).toEqual(["ops"])
  })

  it("rejects an id that is not a switcher app", () => {
    expect(() => switcherApps("atto1" as never)).toThrow(/switcher/)
  })
})

describe("COOKIE_DOMAIN", () => {
  it("is the registry's shared cookie domain", () => {
    expect(COOKIE_DOMAIN).toBe(".myargus.cc")
  })
})
