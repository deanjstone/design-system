// The opt-in "DS" theme: a tinted-neutral scale with one elevation ladder, a hairline edge,
// a soft sheen on raised surfaces, squircle corners and recessed wells. It is a look
// reimplemented from the research in argus-config#1149; no DS Code asset, logo, icon or
// stylesheet is copied.
//
//   node scripts/theme/build.mjs     (writes it into the `theme-ds` item of registry.json)
//
// Nothing here touches the six T3 themes or the `theme` item: every selector this theme emits
// is scoped to [data-theme="ds"], so a page that never sets that attribute is unchanged.
// The colours are written as OKLCH steps (readable, and one hue throughout) and rendered to
// the hex the rest of the pipeline and the contrast tests read.

import { contrastRatio, liftContrast } from "./extract-t3.mjs"

export const DS_THEME = "ds"
const HUE = 264

// OKLCH -> sRGB hex (Bjorn Ottosson's matrices), clipped to the gamut.
export function oklchToHex(lightness, chroma, hue = HUE) {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const encode = (value) => {
    const clipped = Math.min(1, Math.max(0, value))
    const encoded = clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055
    return Math.round(encoded * 255).toString(16).padStart(2, "0")
  }
  return `#${linear.map(encode).join("")}`
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

// [lightness, chroma] per step; hue is 264 (a faint blue) for every neutral.
const ramp = {
  light: {
    background: [0.968, 0.004],
    card: [0.992, 0.002],
    popover: [0.998, 0.002],
    muted: [0.935, 0.005], // the recessed well
    secondary: [0.925, 0.006],
    accent: [0.915, 0.008],
    border: [0.875, 0.006],
    foreground: [0.2, 0.01],
    "muted-foreground": [0.46, 0.014],
    "secondary-foreground": [0.24, 0.01],
    primary: [0.5, 0.19],
    "primary-foreground": [0.985, 0.004],
    input: [0.6, 0.01],
    ring: [0.55, 0.17],
    destructive: [0.5, 0.19, 27],
  },
  dark: {
    background: [0.16, 0.004],
    card: [0.205, 0.006],
    popover: [0.235, 0.007],
    muted: [0.135, 0.005], // the recessed well
    secondary: [0.27, 0.008],
    accent: [0.285, 0.01],
    border: [0.3, 0.008],
    foreground: [0.955, 0.004],
    "muted-foreground": [0.72, 0.012],
    "secondary-foreground": [0.92, 0.006],
    primary: [0.7, 0.15],
    "primary-foreground": [0.16, 0.01],
    input: [0.55, 0.012],
    ring: [0.68, 0.14],
    destructive: [0.72, 0.17, 25],
  },
}

// The chart series colours are T3's adaptive ones (Tailwind emerald, amber, indigo and blue),
// the same in every theme; [lightness, chroma, hue] as T3 writes them.
const CHART_STEPS = {
  light: { "chart-2": [0.596, 0.145, 163.225], "chart-3": [0.555, 0.163, 48.998], "chart-4": [0.511, 0.262, 276.966], "chart-5": [0.546, 0.245, 262.881] },
  dark: { "chart-2": [0.765, 0.177, 163.223], "chart-3": [0.828, 0.189, 84.429], "chart-4": [0.785, 0.115, 274.713], "chart-5": [0.707, 0.165, 254.624] },
}
const CHARTS = Object.fromEntries(
  Object.entries(CHART_STEPS).map(([mode, steps]) => [
    mode,
    Object.fromEntries(Object.entries(steps).map(([name, [l, c, h]]) => [name, oklchToHex(l, c, h)])),
  ]),
)

const GLASS_ALPHA = 0.78
const TEXT_CONTRAST = 4.5

function tokensFor(mode) {
  const step = (name) => {
    const [lightness, chroma, hue] = ramp[mode][name]
    return oklchToHex(lightness, chroma, hue)
  }
  const tokens = Object.fromEntries(Object.keys(ramp[mode]).map((name) => [name, step(name)]))
  const { background, card, popover, foreground, primary } = tokens
  const [r, g, b] = hexToRgb(card)
  return {
    ...tokens,
    "card-foreground": foreground,
    "popover-foreground": foreground,
    "accent-foreground": foreground,
    "destructive-foreground": background,
    "primary-text": liftContrast(primary, foreground, [background, card, popover], TEXT_CONTRAST),
    ...CHARTS[mode],
    "chart-1": primary,
    // The sidebar sits on the canvas: same ground, no panel of its own.
    sidebar: background,
    "sidebar-foreground": foreground,
    "sidebar-primary": primary,
    "sidebar-primary-foreground": tokens["primary-foreground"],
    "sidebar-accent": tokens.accent,
    "sidebar-accent-foreground": foreground,
    "sidebar-border": tokens.border,
    "sidebar-ring": tokens.ring,
    "glass-surface": `rgba(${r}, ${g}, ${b}, ${GLASS_ALPHA})`,
    "glass-fallback": card,
  }
}

export const DS_TOKENS = { light: tokensFor("light"), dark: tokensFor("dark") }

// The two white/black overlays the surface rules mix in; a light page lifts with white and
// shades with a cool ink, a dark page lifts with white at lower strength.
const SURFACE = {
  light: { sheen: "oklch(1 0 0 / 70%)", lit: "oklch(1 0 0 / 90%)", well: "oklch(0.25 0.03 264 / 10%)" },
  dark: { sheen: "oklch(1 0 0 / 5%)", lit: "oklch(1 0 0 / 9%)", well: "oklch(0 0 0 / 35%)" },
}

// Raised surfaces: panels and what floats over them.
const RAISED = [
  '[data-slot="card"]',
  '[data-slot="popover-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="select-content"]',
  '[data-slot="combobox-content"]',
  '[data-slot="dialog-content"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="sheet-content"]',
  '[data-slot="hover-card-content"]',
]
// Recessed wells: fields and the grouped ground tabs and segmented controls sit in.
const WELLS = [
  '[data-slot="input"]',
  '[data-slot="textarea"]',
  '[data-slot="select-trigger"]',
  '[data-slot="input-group"]',
  '[data-slot="tabs-list"]',
]
// Everything that gets the squircle corner.
const ROUNDED = [
  ...RAISED,
  ...WELLS,
  '[data-slot="button"]',
  '[data-slot="badge"]',
  '[data-slot="card-list-entry"]',
  '[data-slot="card-list-group"]',
]

const scoped = (selectors, dark) =>
  selectors.map((selector) => `${dark ? '[data-theme="ds"].dark' : '[data-theme="ds"]'} ${selector}`).join(",\n")
const scopedAnyMode = (selectors) => selectors.map((selector) => `[data-theme="ds"] ${selector}`).join(",\n")

// Declarations for the registry item's `css` object, keyed by selector (nested objects are
// at-rules). Every key starts with [data-theme="ds"].
export function dsSurfaceCss() {
  const css = {}
  for (const dark of [false, true]) {
    const mode = dark ? "dark" : "light"
    const root = dark ? '[data-theme="ds"].dark' : '[data-theme="ds"]'
    css[root] = {
      ...Object.fromEntries(Object.entries(DS_TOKENS[mode]).map(([name, value]) => [`--${name}`, value])),
      "--radius": "0.75rem",
      "color-scheme": mode,
      "--ds-sheen": SURFACE[mode].sheen,
      "--ds-lit-edge": SURFACE[mode].lit,
      "--ds-well": SURFACE[mode].well,
    }
    css[scoped(RAISED, dark)] = {
      "background-image": "linear-gradient(to bottom, var(--ds-sheen), transparent 55%)",
      "box-shadow": "inset 0 1px 0 var(--ds-lit-edge), 0 0 0 1px var(--border)",
      "border-color": "transparent",
    }
    css[scoped(WELLS, dark)] = {
      "background-color": "var(--muted)",
      "box-shadow": "inset 0 1px 2px var(--ds-well), 0 0 0 1px var(--border)",
      "border-color": "transparent",
    }
  }
  css["@supports (corner-shape: squircle)"] = {
    [scopedAnyMode(ROUNDED)]: { "corner-shape": "squircle" },
  }
  return css
}

export const dsContrast = (mode, foreground, background) =>
  contrastRatio(DS_TOKENS[mode][foreground], DS_TOKENS[mode][background])
