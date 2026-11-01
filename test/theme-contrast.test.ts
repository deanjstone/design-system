// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { MODES, THEME_NAMES, contrastRatio } from "../scripts/theme/extract-t3.mjs"

// Contrast of the text pairs the blocks actually draw, over all 12 theme/mode
// blocks (design-system#137, from the #144 audit). theme-tokens.test.ts holds the
// plain token pairs; this holds the composed ones: a translucent foreground, a
// tinted badge wash, the primary colour used as text or an icon.
//
// KNOWN_BELOW lists the pairs the audit measured under the bar. #146 fixes them.
// A listed pair must still be under the bar, so the fix that clears one fails
// this test until its entry is deleted: the list can only shrink.

type Tokens = Record<string, string>
const themes: Record<string, Record<string, Tokens>> = JSON.parse(
  readFileSync(fileURLToPath(new URL("../theme/themes.json", import.meta.url)), "utf8"),
).themes

const channels = (color: string): number[] => {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) return [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16))
  const rgb = /^rgba?\(([^)]*)\)$/.exec(color)
  if (rgb) return rgb[1].split(",").slice(0, 3).map(Number)
  throw new Error(`need a hex or rgb() colour, got ${color}`)
}

// `color` at `alpha` painted over `ground`, as an opaque hex.
const over = (color: string, alpha: number, ground: string) => {
  const [front, back] = [channels(color), channels(ground)]
  return `#${front.map((value, at) => Math.round(value * alpha + back[at] * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`
}

const TEXT = 4.5

type Pair = { name: string; minimum: number; ratio: (tokens: Tokens, mode: string) => number }

const PAIRS: Pair[] = [
  // button.tsx, app-shell.tsx, app-switcher.tsx draw --primary as text or an icon.
  { name: "primary text on background", minimum: TEXT, ratio: (t) => contrastRatio(t.primary, t.background) },
  { name: "primary text on card", minimum: TEXT, ratio: (t) => contrastRatio(t.primary, t.card) },
  // tabs.tsx: inactive trigger is text-foreground/60 in light, muted-foreground in dark, on --muted.
  {
    name: "inactive tab label on muted",
    minimum: TEXT,
    ratio: (t, mode) =>
      mode === "dark"
        ? contrastRatio(t["muted-foreground"], t.muted)
        : contrastRatio(over(t.foreground, 0.6, t.muted), t.muted),
  },
  // badge.tsx destructive: text-destructive on destructive/10 (light) or /20 (dark).
  {
    name: "destructive badge label",
    minimum: TEXT,
    ratio: (t, mode) => contrastRatio(t.destructive, over(t.destructive, mode === "dark" ? 0.2 : 0.1, t.background)),
  },
]

const KNOWN_BELOW = new Set([
  "primary text on background|default|dark",
  "primary text on background|t3-chat|light",
  "primary text on background|t3-chat|dark",
  "primary text on card|default|dark",
  "primary text on card|t3-chat|light",
  "primary text on card|t3-chat|dark",
  "inactive tab label on muted|default|light",
  "inactive tab label on muted|t3-chat|light",
  "inactive tab label on muted|grove|light",
  "inactive tab label on muted|ocean|light",
  "inactive tab label on muted|ember|light",
  "inactive tab label on muted|iris|light",
  "destructive badge label|grove|dark",
  "destructive badge label|ocean|dark",
  "destructive badge label|ember|dark",
  "destructive badge label|iris|dark",
])

describe("composed text pairs", () => {
  describe.each(THEME_NAMES)("%s", (theme: string) => {
    it.each(MODES)("meets the bar, or is a listed known miss, in %s mode", (mode: string) => {
      const tokens = themes[theme][mode]
      for (const pair of PAIRS) {
        const ratio = pair.ratio(tokens, mode)
        const key = `${pair.name}|${theme}|${mode}`
        if (KNOWN_BELOW.has(key)) {
          expect(ratio, `${key} now clears ${pair.minimum}:1: delete it from KNOWN_BELOW (design-system#146)`).toBeLessThan(
            pair.minimum,
          )
        } else {
          expect(ratio, key).toBeGreaterThanOrEqual(pair.minimum)
        }
      }
    })
  })

  it("lists no pair that does not exist", () => {
    const names = new Set(PAIRS.map((pair) => pair.name))
    for (const key of KNOWN_BELOW) {
      const [name, theme, mode] = key.split("|")
      expect(names.has(name), key).toBe(true)
      expect(THEME_NAMES, key).toContain(theme)
      expect(MODES, key).toContain(mode)
    }
  })
})
