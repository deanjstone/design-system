// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// The root font and iOS Larger Text (design-system#150, #163). The registry follows
// Dynamic Type only through one guarded rule, so nothing may move the root font
// anywhere else: at the default size, on every platform, text is the size it was.

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const GUARD = "@supports (font: -apple-system-body) and (-webkit-touch-callout: none)"

const tokensCss = read("../theme/tokens.css")
const registry = JSON.parse(read("../registry.json"))
const registryTheme = registry.items.find((item: { name: string }) => item.name === "theme")
const builtTheme = JSON.parse(read("../r/theme.json"))

// A rule that sets the font or font-size of html, :root or body, in a CSS block.
const ROOT_FONT = /(?:^|[,}\s])(?:html|:root|body)\b[^{}]*\{[^{}]*(?<![-\w])font(?:-size)?\s*:/

const withoutGuardedBlock = (css: string) => {
  const start = css.indexOf(GUARD)
  if (start === -1) return css
  let depth = 0
  for (let index = css.indexOf("{", start); index < css.length; index++) {
    if (css[index] === "{") depth++
    if (css[index] === "}" && --depth === 0) return css.slice(0, start) + css.slice(index + 1)
  }
  throw new Error("unbalanced braces after the Dynamic Type guard")
}

const rootFontKeys = (css: Record<string, unknown>) =>
  Object.entries(css)
    .filter(([key]) => /^(html|:root|body)\b/.test(key))
    .filter(([, body]) => typeof body === "object" && body !== null && Object.keys(body).some((name) => name === "font" || name === "font-size"))
    .map(([key]) => key)

describe("no change at the default size", () => {
  it("sets no root font in tokens.css outside the one guarded block", () => {
    expect(withoutGuardedBlock(tokensCss)).not.toMatch(ROOT_FONT)
  })

  it("sets no root font in the theme item outside the one guarded block", () => {
    expect(rootFontKeys(registryTheme.css)).toEqual([])
  })

  it("ships the same to consumers in the built r/theme.json", () => {
    expect(rootFontKeys(builtTheme.css)).toEqual([])
  })
})

describe("the Dynamic Type rule", () => {
  const guardedBody = () => {
    const start = tokensCss.indexOf(GUARD)
    expect(start).toBeGreaterThan(-1)
    return tokensCss.slice(start, tokensCss.length - withoutGuardedBlock(tokensCss).length + start)
  }

  it("is one block in tokens.css, guarded to iOS so macOS Safari (a 13px body) is untouched", () => {
    expect(tokensCss.split(GUARD)).toHaveLength(2)
    expect(guardedBody()).toMatch(/html\s*\{\s*font-size:\s*calc\(100% \* var\(--dt-scale, 1\)\);\s*\}/)
  })

  it("is a percentage of the browser default times the scale, so an unset scale is 100%", () => {
    expect(guardedBody()).toContain("var(--dt-scale, 1)")
    expect(guardedBody()).not.toMatch(/\d+px/)
  })

  it.each([
    ["the theme item", () => registryTheme.css],
    ["r/theme.json", () => builtTheme.css],
  ])("ships the same rule in %s", (_name, css) => {
    expect(css()[GUARD]).toEqual({ html: { "font-size": "calc(100% * var(--dt-scale, 1))" } })
  })
})

describe("the head snippet's scale", () => {
  const html = read("../registry/app-html-head/app-html-head.html")
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ""

  // Runs the snippet against a fake browser: `bodySize` is what a probe element with
  // `font: -apple-system-body` measures, or undefined when the browser lacks that font.
  const run = ({ bodySize, ios = true }: { bodySize?: number; ios?: boolean }) => {
    const properties = new Map<string, string>()
    const listeners: Record<string, () => void> = {}
    const probe = { setAttribute: () => {}, style: { cssText: "" } }
    let attached = 0
    const documentElement = {
      style: { setProperty: (name: string, value: string) => properties.set(name, value) },
      appendChild: () => attached++,
      removeChild: () => attached--,
    }
    const CSS = { supports: (property: string, value: string) => (property === "font" ? bodySize !== undefined : ios && property === "-webkit-touch-callout" && value === "none") }
    new Function("document", "CSS", "getComputedStyle", "addEventListener", script)(
      { documentElement, createElement: () => probe, addEventListener: (type: string, listener: () => void) => (listeners[type] = listener) },
      CSS,
      () => ({ fontSize: `${bodySize}px` }),
      (type: string, listener: () => void) => (listeners[type] = listener),
    )
    return { properties, listeners, attached: () => attached, probe }
  }

  it("is an inline script in the snippet", () => {
    expect(script.trim()).not.toBe("")
  })

  it("leaves the scale at 1 at iOS's default body size, 17px", () => {
    expect(run({ bodySize: 17 }).properties.get("--dt-scale")).toBe("1")
  })

  it.each([
    [14, "0.824"],
    [19, "1.118"],
    [25.5, "1.5"],
    [52.7, "3.1"],
  ])("scales a %spx body to %s", (bodySize, scale) => {
    expect(run({ bodySize }).properties.get("--dt-scale")).toBe(scale)
  })

  it("measures with the system body font and leaves nothing in the document", () => {
    const { probe, attached } = run({ bodySize: 17 })
    expect(probe.style.cssText).toContain("font:-apple-system-body")
    expect(attached()).toBe(0)
  })

  it("sets nothing where there is no -apple-system-body", () => {
    expect(run({ bodySize: undefined }).properties.size).toBe(0)
  })

  it("sets nothing on macOS Safari, which has the font (13px) but not the iOS-only touch callout", () => {
    expect(run({ bodySize: 13, ios: false }).properties.size).toBe(0)
  })

  it("measures again when Larger Text may have changed", () => {
    const { listeners } = run({ bodySize: 17 })
    expect(Object.keys(listeners).sort()).toEqual(["pageshow", "resize", "visibilitychange"])
  })
})
