// @vitest-environment node

import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// The safe-area foundation (design-system#137): inset tokens, edge utilities,
// min-h-app, scroll-padding tokens and the app-html-head item. tokens.css and the
// "theme" item in registry.json are two hand-kept copies of the same CSS, so each
// expectation is checked against both, and against the built r/theme.json.

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const tokensCss = read("../theme/tokens.css")
const registry = JSON.parse(read("../registry.json"))
const registryTheme = registry.items.find((item: { name: string }) => item.name === "theme")
const builtTheme = JSON.parse(read("../r/theme.json"))
const themes = JSON.parse(read("../theme/themes.json")).themes

const TOKENS: Record<string, string> = {
  "safe-t": "env(safe-area-inset-top, 0px)",
  "safe-r": "env(safe-area-inset-right, 0px)",
  "safe-b": "env(safe-area-inset-bottom, 0px)",
  "safe-l": "env(safe-area-inset-left, 0px)",
  gutter: "1rem",
  "corner-clear": "1.3rem",
  "edge-x": "max(var(--gutter), var(--safe-l))",
  "edge-x-end": "max(var(--gutter), var(--safe-r))",
  "edge-b": "max(0.5rem, calc(var(--safe-b) - 12px))",
  "scroll-pad-top": "0px",
  "scroll-pad-bottom": "0px",
}

const UTILITIES: Record<string, Record<string, unknown>> = {
  "px-edge": { "padding-left": "var(--edge-x)", "padding-right": "var(--edge-x-end)" },
  "pb-edge": { "padding-bottom": "var(--edge-b)" },
  "inset-corner-br": {
    right: "max(var(--corner-clear), var(--safe-r))",
    bottom: "var(--edge-b)",
  },
  "min-h-app": {
    "min-height": "100dvh",
    "@supports not (min-height: 100dvh)": { "min-height": "100vh" },
  },
}

const declarationOf = (css: string, name: string) =>
  new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m").exec(css)?.[1].replace(/\s+/g, " ").trim()

describe("safe-area tokens", () => {
  it.each(Object.entries(TOKENS))("declares --%s in tokens.css", (name, value) => {
    expect(declarationOf(tokensCss, name)).toBe(value)
  })

  it.each(Object.entries(TOKENS))("ships --%s in the theme item's light vars", (name, value) => {
    expect(registryTheme.cssVars.light[name]).toBe(value)
  })

  it.each(Object.entries(TOKENS))("carries --%s into the built r/theme.json", (name, value) => {
    expect(builtTheme.cssVars.light[name]).toBe(value)
  })

  it("keeps the corner clearance wider than the gutter, so a corner control clears the curve", () => {
    expect(parseFloat(TOKENS["corner-clear"])).toBeGreaterThan(parseFloat(TOKENS.gutter))
  })
})

describe("edge utilities", () => {
  it.each(Object.keys(UTILITIES))("%s is declared in tokens.css", (name) => {
    expect(tokensCss).toMatch(new RegExp(`@utility ${name} \\{`))
  })

  it.each(Object.entries(UTILITIES))("%s ships the same declarations in the theme item and r/theme.json", (name, body) => {
    expect(registryTheme.css[`@utility ${name}`]).toEqual(body)
    expect(builtTheme.css[`@utility ${name}`]).toEqual(body)
  })

  it("lays out the same declarations in tokens.css as in the item", () => {
    const block = (name: string) => tokensCss.match(new RegExp(`@utility ${name} \\{[\\s\\S]*?\\n\\}`))![0]
    expect(block("px-edge")).toContain("padding-left: var(--edge-x)")
    expect(block("px-edge")).toContain("padding-right: var(--edge-x-end)")
    expect(block("pb-edge")).toContain("padding-bottom: var(--edge-b)")
    expect(block("inset-corner-br")).toContain("right: max(var(--corner-clear), var(--safe-r))")
    expect(block("inset-corner-br")).toContain("bottom: var(--edge-b)")
    expect(block("min-h-app")).toMatch(/min-height: 100dvh;[\s\S]*@supports not \(min-height: 100dvh\) \{[\s\S]*min-height: 100vh/)
  })

  it("documents why pl-safe alone is not enough, beside the pl-safe family", () => {
    const comment = tokensCss.slice(tokensCss.lastIndexOf("/*", tokensCss.indexOf("@utility pt-safe")), tokensCss.indexOf("@utility pt-safe"))
    expect(comment).toMatch(/pl-safe/)
    expect(comment).toMatch(/landscape/i)
    expect(comment).toMatch(/Safari/)
    expect(comment).toMatch(/px-edge/)
  })

  it("leaves the pt-safe family as it was, so a consumer using it keeps working", () => {
    expect(registryTheme.css["@utility pl-safe"]).toEqual({ "padding-left": "max(env(safe-area-inset-left), 0px)" })
    expect(registryTheme.css["@utility pt-safe"]).toEqual({ "padding-top": "max(env(safe-area-inset-top), 0px)" })
  })
})

describe("scroll padding", () => {
  it("lets the page set scroll-padding from the two tokens, 0 until an app sets them", () => {
    expect(tokensCss).toMatch(/html \{[^}]*scroll-padding-top: var\(--scroll-pad-top\)/)
    expect(tokensCss).toMatch(/html \{[^}]*scroll-padding-bottom: var\(--scroll-pad-bottom\)/)
    expect(registryTheme.css.html).toMatchObject({
      "scroll-padding-top": "var(--scroll-pad-top)",
      "scroll-padding-bottom": "var(--scroll-pad-bottom)",
    })
  })
})

describe("app-html-head item", () => {
  const item = registry.items.find((candidate: { name: string }) => candidate.name === "app-html-head")
  const file = item?.files?.[0]
  const head = () => read(`../${file.path}`)

  it("is a registry:file item that lands a snippet at the project root", () => {
    expect(item?.type).toBe("registry:file")
    expect(file.target).toBe("~/app-html-head.html")
    expect(existsSync(fileURLToPath(new URL(`../${file.path}`, import.meta.url)))).toBe(true)
  })

  it("sets viewport-fit=cover and never locks the zoom", () => {
    const viewport = head().match(/<meta name="viewport"[^>]*>/)![0]
    expect(viewport).toContain("width=device-width")
    expect(viewport).toContain("initial-scale=1")
    expect(viewport).toContain("viewport-fit=cover")
    expect(head()).not.toMatch(/maximum-scale|user-scalable/)
  })

  it("carries the apple-mobile-web-app set with the default status bar", () => {
    expect(head()).toContain('<meta name="apple-mobile-web-app-capable" content="yes"')
    expect(head()).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default"')
    expect(head()).toContain('<meta name="apple-mobile-web-app-title"')
    expect(head()).not.toContain("black-translucent")
  })

  it("carries a light and a dark theme-color that match the default theme's background", () => {
    expect(head()).toContain(`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${themes.ocean.light.background}"`)
    expect(head()).toContain(`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${themes.ocean.dark.background}"`)
  })

  it("passes the design-check viewport rule", async () => {
    const { checkSource } = await import("../registry/design-check/design-rules.mjs")
    expect(checkSource("index.html", head())).toEqual([])
  })

  it("is built into r/", () => {
    expect(existsSync(fileURLToPath(new URL("../r/app-html-head.json", import.meta.url)))).toBe(true)
  })
})
