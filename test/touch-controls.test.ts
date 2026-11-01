// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// Touch-friendly form controls (design-system#145). The rendered proof is the
// geometry gate (pnpm gate:geometry); this is the part CI can see: the coarse
// block of tokens.css and the registry "theme" item agree and cover every control,
// and the text fields no longer drop to 14px on width alone.

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const tokensCss = read("../theme/tokens.css")
const registry = JSON.parse(read("../registry.json"))
const registryTheme = registry.items.find((item: { name: string }) => item.name === "theme")

const coarseCss = (() => {
  const start = tokensCss.indexOf("@media (pointer: coarse) {")
  const end = tokensCss.indexOf("/*\n * Safe-area inset utilities")
  return tokensCss.slice(start, end)
})()

const findCoarse = (node: unknown): Record<string, Record<string, string>> | undefined => {
  if (!node || typeof node !== "object") return undefined
  const record = node as Record<string, unknown>
  if (record["@media (pointer: coarse)"]) return record["@media (pointer: coarse)"] as Record<string, Record<string, string>>
  for (const value of Object.values(record)) {
    const found = findCoarse(value)
    if (found) return found
  }
  return undefined
}
const registryCoarse = findCoarse(registryTheme.css)!

const FLOORED = ["button", "input", "command-input", "select-trigger", "toggle", "tabs-trigger", "dialog-close"]
const WIDENED = ['[data-slot="checkbox"]::after', '[data-slot="switch"]::after', 'a[data-slot="badge"]::after', 'button[data-slot="badge"]::after']

describe("coarse-pointer block", () => {
  it.each(FLOORED)("raises %s to 44px in tokens.css", (slot) => {
    expect(coarseCss).toMatch(new RegExp(`\\[data-slot="${slot}"\\][^{]*\\{[^}]*min-height: 44px`))
  })

  it.each(WIDENED)("widens the tap region of %s to 44px", (selector) => {
    expect(coarseCss).toContain(selector)
    const rule = Object.entries(registryCoarse).find(([key]) => key.includes(selector))
    expect(rule?.[1]).toMatchObject({ "min-width": "44px", "min-height": "44px" })
  })

  it.each(FLOORED)("carries the %s floor in the registry theme item", (slot) => {
    const rule = Object.entries(registryCoarse).find(([key]) => key.includes(`[data-slot="${slot}"]`))
    expect(rule?.[1]["min-height"]).toBe("44px")
  })

  it("keeps the two copies of the block identical in selector count", () => {
    const selectors = (coarseCss.match(/^ {2}[^\n]*\{$/gm) ?? []).length
    expect(Object.keys(registryCoarse)).toHaveLength(selectors)
  })
})

describe("16px text on a coarse pointer", () => {
  const source = (name: string) => read(`../registry/base-nova/ui/${name}.tsx`)

  it.each(["input", "textarea"])("%s drops to text-sm only for a fine pointer", (name) => {
    expect(source(name)).toContain("md:pointer-fine:text-sm")
    expect(source(name)).not.toMatch(/(?<!pointer-fine:)md:text-sm/)
  })

  it("command input is 16px unless the pointer is fine", () => {
    expect(source("command")).toContain("text-base outline-hidden pointer-fine:text-sm")
  })

  it("sidebar hides a menu action until hover only where hover exists", () => {
    expect(source("sidebar")).toContain("md:pointer-fine:opacity-0")
    expect(source("sidebar")).not.toMatch(/(?<!pointer-fine:)md:opacity-0/)
  })
})
