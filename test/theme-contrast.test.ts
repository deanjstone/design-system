// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { MODES, THEME_NAMES, contrastRatio } from "../scripts/theme/extract-t3.mjs"

// Contrast of the pairs the blocks actually draw, over all 12 theme/mode blocks
// (design-system#137 from the #144 audit, fixed in #146). theme-tokens.test.ts holds the
// plain token pairs; this holds the composed ones: a translucent foreground, a tinted
// badge wash, the primary colour used as text or an icon, a label on a glass bar.
// Every pair must clear its bar in every block: there is no list of known misses.

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

const alphaOf = (color: string) => Number(/,\s*([\d.]+)\)$/.exec(color)?.[1] ?? 1)

// The bar surface over a page ground, as the glass bars paint it (surface-glass in tokens.css).
// The blur averages whatever scrolls beneath it, so the grounds tried are the page surfaces.
const glassOver = (tokens: Tokens, ground: string) => over(tokens["glass-surface"], alphaOf(tokens["glass-surface"]), ground)

const TEXT = 4.5

type Pair = { name: string; minimum: number; ratio: (tokens: Tokens, mode: string) => number }

// Badge washes (badge.tsx destructive): the label colour on destructive at this alpha over the page.
const BADGE_WASH = { light: 0.1, dark: 0.1 }
const BADGE_HOVER_WASH = { light: 0.12, dark: 0.12 }

const PAIRS: Pair[] = [
  // button.tsx, app-switcher.tsx and settings-page.tsx draw --primary-text where the primary colour is text or an icon.
  { name: "primary text on background", minimum: TEXT, ratio: (t) => contrastRatio(t["primary-text"], t.background) },
  { name: "primary text on card", minimum: TEXT, ratio: (t) => contrastRatio(t["primary-text"], t.card) },
  { name: "primary text on popover", minimum: TEXT, ratio: (t) => contrastRatio(t["primary-text"], t.popover) },
  // tabs.tsx: the inactive trigger is text-muted-foreground in both modes, on --muted.
  { name: "inactive tab label on muted", minimum: TEXT, ratio: (t) => contrastRatio(t["muted-foreground"], t.muted) },
  // The focus ring is a solid --ring (--sidebar-ring on the sidebar), no longer ring/50,
  // against what it is drawn over. WCAG 1.4.11 asks 3:1 for a focus indicator (#144 F1/F3).
  { name: "focus ring on background", minimum: 3, ratio: (t) => contrastRatio(t.ring, t.background) },
  { name: "focus ring on card", minimum: 3, ratio: (t) => contrastRatio(t.ring, t.card) },
  { name: "focus ring on popover", minimum: 3, ratio: (t) => contrastRatio(t.ring, t.popover) },
  { name: "focus ring on muted", minimum: 3, ratio: (t) => contrastRatio(t.ring, t.muted) },
  { name: "sidebar focus ring on sidebar", minimum: 3, ratio: (t) => contrastRatio(t["sidebar-ring"], t.sidebar) },
  // app-shell.tsx: the active tab is text-foreground on --muted, its icon included (#144 C2).
  { name: "active tab on muted", minimum: TEXT, ratio: (t) => contrastRatio(t.foreground, t.muted) },
  // badge.tsx destructive: text-destructive on its wash, at rest and on a link badge's hover.
  ...(["background", "card"] as const).flatMap((ground): Pair[] => [
    {
      name: `destructive badge label on ${ground}`,
      minimum: TEXT,
      ratio: (t, mode) =>
        contrastRatio(t.destructive, over(t.destructive, BADGE_WASH[mode as "light" | "dark"], t[ground])),
    },
    {
      name: `destructive badge label on ${ground}, hovered`,
      minimum: TEXT,
      ratio: (t, mode) =>
        contrastRatio(t.destructive, over(t.destructive, BADGE_HOVER_WASH[mode as "light" | "dark"], t[ground])),
    },
  ]),
  // app-shell.tsx: the header and tab bar are glass bars over the page (#144 C6). Their labels clear the bar
  // over each page surface; the harness (npm run gate:geometry) samples the real pixels over real content.
  ...(["background", "card", "muted"] as const).flatMap((ground): Pair[] => [
    {
      name: `glass bar label (foreground) over ${ground}`,
      minimum: TEXT,
      ratio: (t) => contrastRatio(t.foreground, glassOver(t, t[ground])),
    },
    {
      name: `glass bar inactive tab label over ${ground}`,
      minimum: TEXT,
      ratio: (t) => {
        const bar = glassOver(t, t[ground])
        return contrastRatio(over(t.foreground, 0.8, bar), bar)
      },
    },
  ]),
]

describe("composed pairs", () => {
  describe.each(THEME_NAMES)("%s", (theme: string) => {
    it.each(MODES)("meets the bar in %s mode", (mode: string) => {
      const tokens = themes[theme][mode]
      for (const pair of PAIRS) {
        expect(pair.ratio(tokens, mode), `${pair.name}|${theme}|${mode}`).toBeGreaterThanOrEqual(pair.minimum)
      }
    })
  })
})

// The classes that draw those pairs. A pair above is only as good as the component that uses it.
const source = (file: string) =>
  readFileSync(fileURLToPath(new URL(`../registry/base-nova/${file}`, import.meta.url)), "utf8")

describe("component classes draw the pairs above", () => {
  const TEXT_PRIMARY = /(?:^|[\s"'`:\]])text-primary(?![-\w])/

  const registryFiles = ["ui", "blocks"].flatMap((dir) =>
    readdirSync(fileURLToPath(new URL(`../registry/base-nova/${dir}`, import.meta.url)))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => `${dir}/${name}`),
  )

  it.each(registryFiles)("%s draws the primary colour as text with text-primary-text, not text-primary", (file) => {
    expect(source(file)).not.toMatch(TEXT_PRIMARY)
  })

  it("tabs.tsx draws the inactive label in muted-foreground, not foreground/60", () => {
    const tabs = source("ui/tabs.tsx")
    expect(tabs).not.toContain("text-foreground/60")
    expect(tabs).toContain("text-muted-foreground")
  })

  it("badge.tsx washes the destructive badge at the alphas the pairs use", () => {
    const badge = source("ui/badge.tsx")
    expect(badge).toContain("bg-destructive/10 text-destructive")
    expect(badge).toContain("dark:bg-destructive/10")
    expect(badge).toContain("[a]:hover:bg-destructive/12")
  })

  it.each([
    "blocks/app-switcher.tsx",
    "ui/toggle.tsx",
    "ui/attachment.tsx",
    "ui/trace.tsx",
  ])("%s has no translucent-only focus ring", (file) => {
    expect(source(file)).not.toContain("ring-ring/50")
  })

  it("app-shell.tsx draws the inactive tab label in foreground/80, which the glass pairs use", () => {
    expect(source("blocks/app-shell.tsx")).toContain('"text-foreground/80 hover:text-foreground"')
  })
})
