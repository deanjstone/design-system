// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  THEME_NAMES,
  TOKEN_MAP,
  contrastRatio,
  extractThemes,
  parseT3Variants,
} from "../scripts/theme/extract-t3.mjs"

// A cut-down generated-uniwind-themes.css: two variants, the T3 tokens the map reads.
const variantBlock = (name: string, tokens: Record<string, string>) =>
  `    @variant ${name} {\n${Object.entries(tokens)
    .map(([key, value]) => `      --color-${key}: ${value};`)
    .join("\n")}\n    }\n`

const t3Tokens = (overrides: Record<string, string> = {}) => {
  const tokens: Record<string, string> = {}
  for (const t3Name of new Set(Object.values(TOKEN_MAP))) tokens[t3Name] = "#808080"
  return { ...tokens, screen: "#ffffff", foreground: "#111111", ...overrides }
}

const fixtureCss = (overrides: Record<string, string> = {}) =>
  `@layer theme {\n  :root {\n${["light", "dark"]
    .concat(THEME_NAMES.filter((n: string) => n !== "default").flatMap((n: string) => [`${n}-light`, `${n}-dark`]))
    .map((variant) => variantBlock(variant, t3Tokens(variant === "light" ? overrides : {})))
    .join("")}  }\n}\n`

describe("parseT3Variants", () => {
  it("reads one token map per @variant block", () => {
    const css = `@layer theme { :root {\n${variantBlock("light", { screen: "#fff" })}${variantBlock("ocean-dark", { screen: "#000" })}} }`
    expect(parseT3Variants(css)).toEqual({
      light: { screen: "#fff" },
      "ocean-dark": { screen: "#000" },
    })
  })
})

describe("extractThemes", () => {
  it("maps T3's light/dark to the default theme and name-light/-dark to the rest", () => {
    const { themes } = extractThemes(fixtureCss({ screen: "#fcfcfc" }))
    expect(Object.keys(themes)).toEqual(THEME_NAMES)
    expect(themes.default.light.background).toBe("#fcfcfc")
  })

  it("maps each shadcn token from the T3 token named in TOKEN_MAP", () => {
    const { themes } = extractThemes(fixtureCss({ "grouped-card": "#f4f4f5", "foreground-muted": "#6f6f79" }))
    expect(themes.ocean.light.muted).toBe("#808080")
    expect(themes.default.light.muted).toBe("#f4f4f5")
    expect(themes.default.light["muted-foreground"]).toBe("#6f6f79")
  })

  it("fails loudly when a variant or a mapped token is missing", () => {
    expect(() => extractThemes("@layer theme { :root { } }")).toThrow(/light/)
    const css = fixtureCss().replace("--color-sheet-solid: #808080;", "")
    expect(() => extractThemes(css)).toThrow(/sheet-solid/)
  })

  it("lifts a field border that clears less than 3:1 until it does, and records the change", () => {
    const { themes, adjustments } = extractThemes(
      fixtureCss({ "input-border": "#e4e4e7", focus: "#f0f0f0" }),
    )
    const { input, ring, background } = themes.default.light
    expect(contrastRatio(input, background)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(ring, background)).toBeGreaterThanOrEqual(3)
    expect(adjustments).toContainEqual(
      expect.objectContaining({ theme: "default", mode: "light", token: "input", from: "#e4e4e7", to: input }),
    )
  })

  it("leaves a token alone when T3's value already clears 3:1", () => {
    const { themes, adjustments } = extractThemes(fixtureCss({ "input-border": "#555555", card: "#ffffff", focus: "#555555" }))
    expect(themes.default.light.input).toBe("#555555")
    expect(adjustments.filter((a: { theme: string; mode: string; token: string }) => a.theme === "default" && a.mode === "light" && a.token === "input")).toEqual([])
  })
})

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5)
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5)
  })

  it("ignores alpha-less rgba() channels the way T3 writes them", () => {
    expect(contrastRatio("rgba(0, 0, 0, 0.5)", "#ffffff")).toBeCloseTo(21, 5)
  })
})
