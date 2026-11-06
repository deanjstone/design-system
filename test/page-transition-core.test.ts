// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  DARK_BRIGHTNESS,
  DEFAULT_TOKENS,
  isDarkMode,
  parseCssColor,
  readTokenColors,
  resolveSweepLook,
} from "../registry/lib/page-transition-core"

// page-transition-core (design-system#198): turns the theme's CSS custom properties into the
// colours of glimm's sweep band. Pure functions, so the theme logic is testable without WebGL.

const channels = (hex: string | null) => {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  return [1, 3, 5].map((start) => Number.parseInt((hex ?? "").slice(start, start + 2), 16))
}

const expectNear = (hex: string | null, expected: number[], tolerance = 2) => {
  channels(hex).forEach((value, index) => {
    expect(Math.abs(value - (expected[index] ?? 0))).toBeLessThanOrEqual(tolerance)
  })
}

const styleOf = (vars: Record<string, string>) => ({
  getPropertyValue: (name: string) => vars[name] ?? "",
})

describe("parseCssColor", () => {
  it.each([
    ["#0a6f75", "#0a6f75"],
    ["#0A6F75", "#0a6f75"],
    ["  #0a6f75  ", "#0a6f75"],
    ["#fa0", "#ffaa00"],
    ["rgb(10 111 117)", "#0a6f75"],
    ["rgb(10, 111, 117)", "#0a6f75"],
  ])("reads %s", (input, expected) => {
    expect(parseCssColor(input)).toBe(expected)
  })

  it("converts oklch, the format the chart tokens use", () => {
    expectNear(parseCssColor("oklch(100% 0 0)"), [255, 255, 255], 1)
    expectNear(parseCssColor("oklch(0% 0 0)"), [0, 0, 0], 1)
    expectNear(parseCssColor("oklch(62.8% 0.2577 29.23)"), [255, 0, 0], 3)
    expectNear(parseCssColor("oklch(59.6% 0.145 163.225)"), [0, 153, 102], 3)
    expectNear(parseCssColor("oklch(0.596 0.145 163.225)"), [0, 153, 102], 3)
  })

  it("clamps an out-of-gamut oklch instead of overflowing a channel", () => {
    const hex = parseCssColor("oklch(90% 0.4 150)")
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it.each(["", "   ", "var(--primary)", "not a colour", "#12", "#12345", "oklch(foo)", "color-mix(in oklab, red, blue)"])(
    "returns null for %j",
    (input) => {
      expect(parseCssColor(input)).toBeNull()
    },
  )
})

describe("readTokenColors", () => {
  it("reads the tokens in order", () => {
    const style = styleOf({ "--a": "#112233", "--b": "oklch(100% 0 0)", "--c": "#445566" })
    const colors = readTokenColors(style, ["--a", "--b", "--c"])
    expect(colors?.[0]).toBe("#112233")
    expectNear(colors?.[1] ?? null, [255, 255, 255], 1)
    expect(colors?.[2]).toBe("#445566")
  })

  it("skips a token that is unset or unparsable", () => {
    const style = styleOf({ "--a": "#112233", "--c": "#445566", "--d": "var(--oops)" })
    expect(readTokenColors(style, ["--a", "--missing", "--c", "--d"])).toEqual(["#112233", "#445566"])
  })

  it("returns null when fewer than two colours resolve, so the caller can cut instead", () => {
    expect(readTokenColors(styleOf({ "--a": "#112233" }), ["--a", "--b"])).toBeNull()
    expect(readTokenColors(styleOf({}), ["--a", "--b"])).toBeNull()
  })
})

describe("isDarkMode", () => {
  it("follows the dark class the theme-preference lib sets on the root", () => {
    const root = (names: string[]) => ({ classList: { contains: (name: string) => names.includes(name) } })
    expect(isDarkMode(root(["dark"]))).toBe(true)
    expect(isDarkMode(root(["wco"]))).toBe(false)
  })
})

describe("resolveSweepLook", () => {
  const light = styleOf({ "--primary": "#0a6f75", "--chart-5": "#2672af", "--chart-4": "#5b4fd0" })
  const dark = styleOf({ "--primary": "#5bd0d6", "--chart-5": "#70b9ee", "--chart-4": "#a5a8f0" })

  it("builds the palette from the default theme tokens", () => {
    expect(DEFAULT_TOKENS).toEqual(["--primary", "--chart-5", "--chart-4"])
    expect(resolveSweepLook(light, { dark: false })?.colors).toEqual(["#0a6f75", "#2672af", "#5b4fd0"])
  })

  it("takes different colours from the dark theme", () => {
    expect(resolveSweepLook(dark, { dark: true })?.colors).toEqual(["#5bd0d6", "#70b9ee", "#a5a8f0"])
  })

  it("dims the band on a dark surface and leaves it full on a light one", () => {
    expect(resolveSweepLook(light, { dark: false })?.brightness).toBe(1)
    expect(resolveSweepLook(dark, { dark: true })?.brightness).toBe(DARK_BRIGHTNESS)
    expect(DARK_BRIGHTNESS).toBeLessThan(1)
  })

  it("accepts a consumer's own tokens", () => {
    const own = styleOf({ "--brand": "#ff0000", "--brand-2": "#0000ff" })
    expect(resolveSweepLook(own, { dark: false, tokens: ["--brand", "--brand-2"] })?.colors).toEqual([
      "#ff0000",
      "#0000ff",
    ])
  })

  it("returns null when the theme tokens are absent, so there is no transition rather than a default look", () => {
    expect(resolveSweepLook(styleOf({}), { dark: false })).toBeNull()
  })
})
