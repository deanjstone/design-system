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
