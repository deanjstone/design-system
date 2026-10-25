// @vitest-environment node

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { MODES, THEME_NAMES, TOKEN_MAP, contrastRatio } from "../scripts/theme/extract-t3.mjs"
import { applyToRegistry, applyToTokensCss } from "../scripts/theme/build.mjs"

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const tokensCss = read("../theme/tokens.css")
const registry = JSON.parse(read("../registry.json"))
const themeSource = JSON.parse(read("../theme/themes.json"))
const registryTheme = registry.items.find((item: { name: string }) => item.name === "theme")
const builtItem = JSON.parse(read("../r/theme.json"))

type Rule = { selector: string; declarations: Record<string, string> }

const parseDeclarations = (body: string) =>
  Object.fromEntries(
    [...body.matchAll(/(-{0,2}[a-z][a-z0-9-]*):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  )

// Every innermost `selector { declarations }` block, selector lists split apart.
const rulesFromCss = (css: string): Rule[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{};]+)\{([^{}]*)\}/g)].flatMap(
    ([, selectors, body]) =>
      selectors
        .split(",")
        .map((selector) => ({ selector: selector.trim(), declarations: parseDeclarations(body) })),
  )

const rulesFromRegistry = (item: {
  cssVars: { light: Record<string, string>; dark: Record<string, string> }
  css: Record<string, Record<string, string> | string>
}): Rule[] => [
  {
    selector: ":root",
    declarations: Object.fromEntries(Object.entries(item.cssVars.light).map(([k, v]) => [`--${k}`, v])),
  },
  {
    selector: ".dark",
    declarations: Object.fromEntries(Object.entries(item.cssVars.dark).map(([k, v]) => [`--${k}`, v])),
  },
  ...Object.entries(item.css).flatMap(([selectors, body]) =>
    typeof body === "object"
      ? selectors.split(/,(?![^[]*\])/).map((selector) => ({ selector: selector.trim(), declarations: body as Record<string, string> }))
      : [],
  ),
]

// The cascade for <html data-theme=… class="dark">: a selector built only from
// :root, .dark and [data-theme="…"] matches when every part does; specificity is
// the part count; later wins on a tie.
const resolveTokens = (rules: Rule[], theme: string | null, dark: boolean) => {
  const resolved: Record<string, { value: string; specificity: number; order: number }> = {}
  rules.forEach(({ selector, declarations }, order) => {
    const parts = selector.match(/:root|\.dark|\[data-theme="[^"]+"\]/g)
    if (!parts || parts.join("") !== selector) return
    const matches = parts.every((part) => {
      if (part === ":root") return true
      if (part === ".dark") return dark
      return theme !== null && part === `[data-theme="${theme}"]`
    })
    if (!matches) return
    for (const [name, value] of Object.entries(declarations)) {
      const previous = resolved[name]
      if (!previous || parts.length >= previous.specificity) {
        resolved[name] = { value, specificity: parts.length, order }
      }
    }
  })
  return Object.fromEntries(Object.entries(resolved).map(([name, { value }]) => [name, value]))
}

const cssRules = rulesFromCss(tokensCss)
const registryRules = rulesFromRegistry(registryTheme)

describe("theme tokens", () => {
  describe.each(THEME_NAMES)("%s", (theme: string) => {
    it.each(MODES)("defines every shadcn token in %s mode", (mode: string) => {
      const resolved = resolveTokens(cssRules, theme, mode === "dark")
      for (const token of Object.keys(TOKEN_MAP)) {
        expect(resolved[`--${token}`], `--${token}`).toBe(themeSource.themes[theme][mode][token])
      }
    })

    it.each(MODES)("meets WCAG AA for text pairs in %s mode", (mode: string) => {
      const t = resolveTokens(cssRules, theme, mode === "dark")
      expect(contrastRatio(t["--foreground"], t["--background"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--primary-foreground"], t["--primary"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--card-foreground"], t["--card"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--secondary-foreground"], t["--secondary"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--muted-foreground"], t["--background"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--muted-foreground"], t["--muted"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--destructive-foreground"], t["--destructive"])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t["--destructive"], t["--background"])).toBeGreaterThanOrEqual(4.5)
    })

    it.each(MODES)("keeps the field edge and focus ring at 3:1 in %s mode", (mode: string) => {
      const t = resolveTokens(cssRules, theme, mode === "dark")
      for (const ground of ["--background", "--card"]) {
        expect(contrastRatio(t["--input"], t[ground])).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(t["--ring"], t[ground])).toBeGreaterThanOrEqual(3)
      }
    })

    it.each(MODES)("ships the same values in registry.json in %s mode", (mode: string) => {
      expect(resolveTokens(registryRules, theme, mode === "dark")).toMatchObject(
        Object.fromEntries(
          Object.keys(TOKEN_MAP).map((token) => [`--${token}`, themeSource.themes[theme][mode][token]]),
        ),
      )
    })
  })

  it("is Ocean with no data-theme attribute, light or dark", () => {
    expect(resolveTokens(cssRules, null, false)["--primary"]).toBe(themeSource.themes.ocean.light.primary)
    expect(resolveTokens(cssRules, null, true)["--primary"]).toBe(themeSource.themes.ocean.dark.primary)
    expect(resolveTokens(registryRules, null, true)["--primary"]).toBe(themeSource.themes.ocean.dark.primary)
  })

  it("lets a theme's dark rules beat the bare .dark rule", () => {
    const grove = resolveTokens(cssRules, "grove", true)
    expect(grove["--primary"]).toBe(themeSource.themes.grove.dark.primary)
    expect(grove["--primary"]).not.toBe(themeSource.themes.ocean.dark.primary)
  })

  it("keeps the 0.625rem radius", () => {
    expect(resolveTokens(cssRules, null, false)["--radius"]).toBe("0.625rem")
    expect(registryTheme.cssVars.light.radius).toBe("0.625rem")
  })

  it("declares a color-scheme per mode so native controls follow the theme", () => {
    expect(resolveTokens(cssRules, null, false)["color-scheme"]).toBe("light")
    expect(resolveTokens(cssRules, "iris", true)["color-scheme"]).toBe("dark")
  })

  it("records the pinned T3 commit", () => {
    expect(themeSource.source.repository).toBe("pingdotgg/t3code")
    expect(themeSource.source.sha).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe("type scale", () => {
  // T3 apps/mobile/global.css, px -> rem at the 16px root.
  const scale = {
    "3xs": [11, 14],
    "2xs": [12, 16],
    xs: [13, 17],
    sm: [14, 19],
    base: [16, 23],
    lg: [18, 23],
    xl: [21, 28],
    "2xl": [26, 32],
    "3xl": [30, 36],
  }
  const toPx = (rem: string) => Number.parseFloat(rem) * 16

  it.each(Object.entries(scale))("text-%s is %s px / line height", (name, [size, lineHeight]) => {
    const declared = parseDeclarations(tokensCss.match(/@theme inline \{([^}]*)\}/)![1])
    expect(toPx(declared[`--text-${name}`])).toBeCloseTo(size as number, 5)
    expect(toPx(declared[`--text-${name}--line-height`])).toBeCloseTo(lineHeight as number, 5)
    expect(toPx(registryTheme.cssVars.theme[`text-${name}`])).toBeCloseTo(size as number, 5)
    expect(toPx(registryTheme.cssVars.theme[`text-${name}--line-height`])).toBeCloseTo(lineHeight as number, 5)
  })

  it("keeps IBM Plex Sans", () => {
    expect(resolveTokens(cssRules, null, false)["--font-sans-stack"]).toMatch(/^"IBM Plex Sans Variable"/)
  })
})

describe("glass tokens", () => {
  it.each(THEME_NAMES.flatMap((theme: string) => MODES.map((mode: string) => [theme, mode])))(
    "%s %s: translucent surface over an opaque fallback",
    (theme: string, mode: string) => {
      const t = resolveTokens(cssRules, theme, mode === "dark")
      expect(t["--glass-surface"]).toMatch(/^rgba\(.*,\s*0\.\d+\)$/)
      expect(t["--glass-fallback"]).toMatch(/^#[0-9a-f]{6}$/)
      expect(t["--glass-blur"]).toBeDefined()
    },
  )

  it("surface-glass blurs the translucent surface and falls back to the opaque one", () => {
    const utility = tokensCss.match(/@utility surface-glass \{[\s\S]*?\n\}/)![0]
    expect(utility).toContain("background: var(--glass-surface)")
    expect(utility).toContain("backdrop-filter: blur(var(--glass-blur))")
    expect(utility).toMatch(/@supports not[\s\S]*background: var\(--glass-fallback\) !important/)
    const shipped = JSON.stringify(registryTheme.css["@utility surface-glass"])
    expect(shipped).toContain("var(--glass-surface)")
    expect(shipped).toContain("var(--glass-fallback) !important")
  })
})

describe("generated outputs", () => {
  it("tokens.css is what scripts/theme/build.mjs writes from theme/themes.json", () => {
    expect(applyToTokensCss(tokensCss, themeSource.themes)).toBe(tokensCss)
  })

  it("registry.json's theme item is what scripts/theme/build.mjs writes", () => {
    expect(applyToRegistry(registry, themeSource.themes)).toEqual(registry)
  })

  it("r/theme.json matches the registry item", () => {
    expect(builtItem.cssVars).toEqual(registryTheme.cssVars)
    expect(builtItem.css).toEqual(registryTheme.css)
  })
})
