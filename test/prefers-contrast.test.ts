// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { contrastRatio } from "../scripts/theme/extract-t3.mjs"

// The prefers-contrast: more layer (design-system#147, from the #144 audit M3).
// tokens.css and the "theme" item in registry.json are two hand-kept copies of the
// same CSS, so the layer is checked in both and in the built r/theme.json. Its
// colour-mix amounts are then read back out of the CSS and held to a contrast bar
// in every one of the 12 theme/mode blocks.

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const MEDIA = "@media (prefers-contrast: more)"
const tokensCss = read("../theme/tokens.css")
const themes: Record<string, Record<string, Record<string, string>>> = JSON.parse(read("../theme/themes.json")).themes

const findLayer = (node: unknown): Record<string, Record<string, string>> | undefined => {
  if (!node || typeof node !== "object") return undefined
  const record = node as Record<string, unknown>
  if (record[MEDIA]) return record[MEDIA] as Record<string, Record<string, string>>
  for (const value of Object.values(record)) {
    const found = findLayer(value)
    if (found) return found
  }
  return undefined
}
const registryTheme = JSON.parse(read("../registry.json")).items.find((item: { name: string }) => item.name === "theme")
const builtTheme = JSON.parse(read("../r/theme.json"))

const layerCss = (() => {
  const start = tokensCss.indexOf(`${MEDIA} {`)
  return tokensCss.slice(start, tokensCss.indexOf("\n}\n", start))
})()

// `color-mix(in srgb, var(--foreground) 70%, var(--background))` -> 0.7
const mixOf = (token: string, source: string) => {
  const found = new RegExp(`--${token}:\\s*color-mix\\(in srgb,\\s*var\\(--foreground\\)\\s+(\\d+)%,\\s*var\\(--background\\)\\)`).exec(source)
  return found ? Number(found[1]) / 100 : undefined
}

const channels = (color: string) => [0, 2, 4].map((at) => parseInt(color.slice(1 + at, 3 + at), 16))
const mixed = (foreground: string, amount: number, ground: string) =>
  `#${channels(foreground)
    .map((value, at) => Math.round(value * amount + channels(ground)[at] * (1 - amount)).toString(16).padStart(2, "0"))
    .join("")}`

const BLOCKS = Object.entries(themes).flatMap(([name, modes]) => Object.entries(modes).map(([mode, tokens]) => ({ label: `${name} ${mode}`, tokens })))
const GROUNDS = ["background", "card", "popover", "muted", "secondary"]

describe("prefers-contrast: more layer", () => {
  it("exists in tokens.css, the registry theme item and the built r/theme.json", () => {
    expect(tokensCss).toContain(MEDIA)
    expect(findLayer(registryTheme.css)).toBeDefined()
    expect(findLayer(builtTheme.css)).toBeDefined()
  })

  it("raises border, input and muted-foreground, and agrees across the three copies", () => {
    for (const token of ["border", "input", "muted-foreground"]) {
      expect(mixOf(token, layerCss), `tokens.css --${token}`).toBeDefined()
    }
    const copies = [findLayer(registryTheme.css), findLayer(builtTheme.css)].map((layer) => JSON.stringify(layer))
    expect(copies[0]).toBe(copies[1])
    for (const token of ["border", "input", "muted-foreground"]) {
      expect(copies[0]).toContain(`--${token}`)
    }
  })

  it("outranks every theme and dark rule, whatever element carries them", () => {
    const selectors = Object.keys(findLayer(registryTheme.css)!).join(", ")
    expect(selectors).toContain(":root:root:root")
    expect(selectors).toContain("[data-theme][data-theme][data-theme]")
    expect(selectors).toContain(".dark.dark.dark")
  })

  it.each(BLOCKS)("clears 3:1 for borders and inputs in $label", ({ tokens }) => {
    const amount = mixOf("border", layerCss)!
    for (const ground of GROUNDS.filter((name) => tokens[name])) {
      expect(contrastRatio(mixed(tokens.foreground, amount, tokens.background), tokens[ground]), ground).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(BLOCKS)("clears 4.5:1 and beats the base token for muted text in $label", ({ tokens }) => {
    const amount = mixOf("muted-foreground", layerCss)!
    const raised = mixed(tokens.foreground, amount, tokens.background)
    for (const ground of GROUNDS.filter((name) => tokens[name])) {
      expect(contrastRatio(raised, tokens[ground]), ground).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(raised, tokens[ground]), `${ground} vs base`).toBeGreaterThanOrEqual(contrastRatio(tokens["muted-foreground"], tokens[ground]))
    }
  })
})
