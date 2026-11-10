// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { DS_TOKENS, dsSurfaceCss, oklchToHex } from "../scripts/theme/ds-theme.mjs"
import { applyDsTheme } from "../scripts/theme/build.mjs"
import { MODES, TOKEN_MAP, contrastRatio } from "../scripts/theme/extract-t3.mjs"

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")
const registry = JSON.parse(read("../registry.json"))
const item = registry.items.find((entry: { name: string }) => entry.name === "theme-ds")
const builtItem = JSON.parse(read("../r/theme-ds.json"))
const themeItem = registry.items.find((entry: { name: string }) => entry.name === "theme")

type CssObject = { [selector: string]: string | CssObject }

// Every selector in the item's css, at-rule bodies included, split into its list parts.
const selectorsOf = (css: CssObject): string[] =>
  Object.entries(css).flatMap(([key, value]) =>
    key.startsWith("@") && typeof value === "object" ? selectorsOf(value) : key.split(",\n"),
  )

describe("DS theme tokens", () => {
  it.each(MODES)("defines every shadcn token the T3 themes define, in %s mode", (mode) => {
    for (const token of [...Object.keys(TOKEN_MAP), "primary-text"]) {
      expect(DS_TOKENS[mode][token], `--${token}`).toMatch(/^#[0-9a-f]{6}$|^rgba\(/)
    }
  })

  it.each(MODES)("meets WCAG AA for text pairs in %s mode", (mode) => {
    const t = DS_TOKENS[mode]
    const pairs = [
      ["foreground", "background"],
      ["foreground", "card"],
      ["primary-foreground", "primary"],
      ["card-foreground", "card"],
      ["secondary-foreground", "secondary"],
      ["muted-foreground", "background"],
      ["muted-foreground", "muted"],
      ["destructive-foreground", "destructive"],
      ["destructive", "background"],
      ["primary-text", "background"],
      ["primary-text", "card"],
      ["primary-text", "popover"],
    ]
    for (const [foreground, ground] of pairs) {
      expect(contrastRatio(t[foreground], t[ground]), `${foreground} on ${ground}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(MODES)("keeps the field edge and focus ring at 3:1 in %s mode", (mode) => {
    const t = DS_TOKENS[mode]
    for (const ground of ["background", "card"]) {
      expect(contrastRatio(t.input, t[ground]), `input on ${ground}`).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(t.ring, t[ground]), `ring on ${ground}`).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(MODES)("climbs the elevation ladder in %s mode: well, canvas, card, popover are four distinct grounds", (mode) => {
    const t = DS_TOKENS[mode]
    expect(new Set([t.muted, t.background, t.card, t.popover]).size).toBe(4)
  })

  it("keeps the dark canvas on the research's tinted neutral, oklch(0.16 0.004 264)", () => {
    expect(DS_TOKENS.dark.background).toBe(oklchToHex(0.16, 0.004, 264))
  })

  it("puts the sidebar on the canvas", () => {
    for (const mode of MODES) expect(DS_TOKENS[mode].sidebar).toBe(DS_TOKENS[mode].background)
  })

  it.each(MODES)("makes a translucent glass surface over an opaque fallback in %s mode", (mode) => {
    expect(DS_TOKENS[mode]["glass-surface"]).toMatch(/^rgba\(.*,\s*0\.\d+\)$/)
    expect(DS_TOKENS[mode]["glass-fallback"]).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe("DS theme item", () => {
  it("is listed as theme-ds, right after theme, and depends on theme", () => {
    expect(item).toBeDefined()
    expect(item.type).toBe("registry:theme")
    expect(item.registryDependencies).toEqual(["deanjstone/design-system/theme"])
    const names = registry.items.map((entry: { name: string }) => entry.name)
    expect(names.indexOf("theme-ds")).toBe(names.indexOf("theme") + 1)
  })

  it("is what scripts/theme/build.mjs writes", () => {
    expect(applyDsTheme(registry)).toEqual(registry)
  })

  it("r/theme-ds.json matches the registry item", () => {
    expect(builtItem.css).toEqual(item.css)
    expect(builtItem.registryDependencies).toEqual(item.registryDependencies)
  })

  it("scopes every selector to [data-theme=\"ds\"], so a page without it is unchanged", () => {
    const selectors = selectorsOf(item.css)
    expect(selectors.length).toBeGreaterThan(6)
    for (const selector of selectors) expect(selector, selector).toMatch(/^\[data-theme="ds"\]/)
  })

  it("declares light and dark token blocks and nothing in :root, .dark or cssVars", () => {
    expect(item.css['[data-theme="ds"]']["--background"]).toBe(DS_TOKENS.light.background)
    expect(item.css['[data-theme="ds"].dark']["--background"]).toBe(DS_TOKENS.dark.background)
    expect(item.css['[data-theme="ds"]']["color-scheme"]).toBe("light")
    expect(item.css['[data-theme="ds"].dark']["color-scheme"]).toBe("dark")
    expect(item.cssVars).toBeUndefined()
    expect(Object.keys(item.css)).not.toContain(":root")
    expect(Object.keys(item.css)).not.toContain(".dark")
  })

  it("rounds corners further and squircles them only where the browser supports it", () => {
    expect(item.css['[data-theme="ds"]']["--radius"]).toBe("0.75rem")
    const supports = item.css["@supports (corner-shape: squircle)"]
    expect(supports).toBeDefined()
    expect(JSON.stringify(supports)).toContain("corner-shape")
    expect(JSON.stringify(Object.fromEntries(Object.entries(item.css).filter(([key]) => !key.startsWith("@supports"))))).not.toContain("corner-shape")
  })

  it("gives raised surfaces a sheen and lit hairline edge, and fields a recessed well", () => {
    const rules = Object.entries(item.css as CssObject).filter(([key]) => key.includes('data-slot="card"') && !key.includes(".dark"))
    expect(rules).toHaveLength(1)
    expect(rules[0][1]).toMatchObject({ "background-image": expect.stringContaining("var(--ds-sheen)") })
    expect(JSON.stringify(rules[0][1])).toContain("var(--ds-lit-edge)")
    const wells = Object.entries(item.css as CssObject).filter(([key]) => key.includes('data-slot="input"') && !key.includes(".dark"))
    expect(JSON.stringify(wells[0][1])).toContain("inset 0 1px 2px var(--ds-well)")
  })

  it("leaves the theme item with no trace of DS", () => {
    expect(JSON.stringify(themeItem)).not.toContain('"ds"')
    expect(JSON.stringify(themeItem)).not.toContain("ds-sheen")
    expect(Object.keys(themeItem.css).filter((key) => key.includes("ds"))).toEqual([])
  })

  it("is generated by dsSurfaceCss with the same keys", () => {
    expect(Object.keys(item.css)).toEqual(Object.keys(dsSurfaceCss()))
  })
})
