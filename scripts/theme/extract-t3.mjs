// Reads T3 Code's generated mobile theme sheet and maps it onto the shadcn token set.
//
//   node scripts/theme/extract-t3.mjs <path-to-generated-uniwind-themes.css> <commit-sha>
//
// writes theme/themes.json. The CSS comes from pingdotgg/t3code
// apps/mobile/generated-uniwind-themes.css; the SHA records which commit it was
// read at. `pnpm build:theme` turns themes.json into tokens.css and registry.json.

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const THEME_NAMES = ["default", "t3-chat", "grove", "ocean", "ember", "iris"]
export const MODES = ["light", "dark"]

// shadcn token -> the T3 token it is read from. DESIGN.md § Themes documents the why.
export const TOKEN_MAP = {
  background: "screen",
  foreground: "foreground",
  card: "card",
  "card-foreground": "foreground",
  popover: "sheet-solid",
  "popover-foreground": "foreground",
  primary: "primary",
  "primary-foreground": "primary-foreground",
  secondary: "secondary",
  "secondary-foreground": "secondary-foreground",
  muted: "grouped-card",
  "muted-foreground": "foreground-muted",
  accent: "row-hover",
  "accent-foreground": "foreground",
  destructive: "danger-foreground",
  "destructive-foreground": "screen",
  border: "border",
  input: "input-border",
  ring: "focus",
  "chart-1": "primary",
  "chart-2": "adaptive-emerald-600-400",
  "chart-3": "adaptive-amber-700-400",
  "chart-4": "adaptive-indigo-600-300",
  "chart-5": "adaptive-blue-600-400",
  sidebar: "drawer",
  "sidebar-foreground": "drawer-foreground",
  "sidebar-primary": "primary",
  "sidebar-primary-foreground": "primary-foreground",
  "sidebar-accent": "row-hover",
  "sidebar-accent-foreground": "foreground",
  "sidebar-border": "drawer-border",
  "sidebar-ring": "focus",
  "glass-surface": "glass-surface",
  "glass-fallback": "grouped-card",
}

// WCAG 1.4.11: a field's edge and the focus ring are the only boundary a control has.
const NON_TEXT_CONTRAST = 3
const CLAMPED_TOKENS = ["input", "ring", "sidebar-ring"]

export const t3VariantName = (theme, mode) => (theme === "default" ? mode : `${theme}-${mode}`)

export function parseT3Variants(css) {
  const variants = {}
  for (const match of css.matchAll(/@variant ([a-z0-9-]+) \{([^}]*)\}/g)) {
    const tokens = {}
    for (const [, name, value] of match[2].matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
      tokens[name] = value.trim()
    }
    variants[match[1]] = tokens
  }
  return variants
}

const channels = (color) => {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
  const rgb = /^rgba?\(([^)]*)\)$/.exec(color)
  if (rgb) return rgb[1].split(",").slice(0, 3).map((part) => Number(part))
  throw new Error(`contrast needs a hex or rgb() colour, got ${color}`)
}

const luminance = (color) => {
  const [r, g, b] = channels(color).map((value) => {
    const unit = value / 255
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`

// Mixes `color` toward `target` one percent at a time and stops at the first mix
// that clears `minimum` against every colour in `against`.
const liftContrast = (color, target, against, minimum) => {
  const from = channels(color)
  const to = channels(target)
  for (let percent = 0; percent <= 100; percent += 1) {
    const mixed = toHex(from.map((value, i) => value + ((to[i] - value) * percent) / 100))
    if (against.every((other) => contrastRatio(mixed, other) >= minimum)) return mixed
  }
  throw new Error(`${color} cannot reach ${minimum}:1 against ${against.join(", ")}`)
}

export function extractThemes(css) {
  const variants = parseT3Variants(css)
  const themes = {}
  const adjustments = []

  for (const theme of THEME_NAMES) {
    themes[theme] = {}
    for (const mode of MODES) {
      const variant = t3VariantName(theme, mode)
      const source = variants[variant]
      if (!source) throw new Error(`T3 theme sheet has no @variant ${variant}`)

      const tokens = {}
      for (const [token, t3Token] of Object.entries(TOKEN_MAP)) {
        if (!(t3Token in source)) throw new Error(`@variant ${variant} has no --color-${t3Token} (needed for ${token})`)
        tokens[token] = source[t3Token]
      }

      for (const token of CLAMPED_TOKENS) {
        const against = [tokens.background, tokens.card]
        if (against.every((other) => contrastRatio(tokens[token], other) >= NON_TEXT_CONTRAST)) continue
        const from = tokens[token]
        tokens[token] = liftContrast(from, tokens.foreground, against, NON_TEXT_CONTRAST)
        adjustments.push({ theme, mode, token, from, to: tokens[token], reason: "WCAG 1.4.11 3:1" })
      }
      themes[theme][mode] = tokens
    }
  }
  return { themes, adjustments }
}

const main = () => {
  const [, , cssPath, sha] = process.argv
  if (!cssPath || !/^[0-9a-f]{40}$/.test(sha ?? "")) {
    console.error("usage: extract-t3.mjs <generated-uniwind-themes.css> <40-char commit sha>")
    process.exit(2)
  }
  const { themes, adjustments } = extractThemes(readFileSync(cssPath, "utf8"))
  const output = {
    source: {
      repository: "pingdotgg/t3code",
      sha,
      files: ["apps/mobile/generated-uniwind-themes.css", "apps/mobile/global.css"],
    },
    adjustments,
    themes,
  }
  const target = fileURLToPath(new URL("../../theme/themes.json", import.meta.url))
  writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`wrote ${target} (${adjustments.length} adjustments)`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
