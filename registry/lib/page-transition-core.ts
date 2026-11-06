// Colour logic for the page-transition item. glimm's sweep band takes a palette built from hex
// colours; the theme stores its colours as hex and oklch() custom properties. These pure functions
// read the properties and convert them, so the band follows the active theme and light/dark mode.

/** The theme tokens the band runs through, in order: cool, like the rest of the system's accent. */
export const DEFAULT_TOKENS: readonly string[] = ["--primary", "--chart-5", "--chart-4"]

/** glimm advises dimming the band on a dark surface, where full brightness reads as harsh white. */
export const DARK_BRIGHTNESS = 0.8

type ColorSource = { getPropertyValue: (name: string) => string }
type ClassSource = { classList: { contains: (name: string) => boolean } }

const toHex = (channels: readonly number[]) =>
  `#${channels.map((value) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0")).join("")}`

const encodeGamma = (linear: number) => {
  const clamped = Math.min(1, Math.max(0, linear))
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
}

// Björn Ottosson's OKLab -> linear sRGB, then gamma. Out-of-gamut values clamp per channel.
const oklchToHex = (lightness: number, chroma: number, hueDegrees: number) => {
  const hue = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return toHex([
    encodeGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encodeGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encodeGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ])
}

const NUMBER = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)"
const OKLCH = new RegExp(`^oklch\\(\\s*(${NUMBER})(%?)\\s+(${NUMBER})\\s+(${NUMBER})(?:deg)?\\s*(?:/\\s*[^)]+)?\\)$`, "i")
const RGB = /^rgba?\(\s*(\d{1,3})\s*[\s,]\s*(\d{1,3})\s*[\s,]\s*(\d{1,3})\s*(?:[,/]\s*[^)]+)?\)$/i
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** A CSS colour as `#rrggbb`, or null when it is not a hex, rgb() or oklch() literal (a var(), a keyword, color-mix()). */
export function parseCssColor(value: string): string | null {
  const text = value.trim()
  const hex = HEX.exec(text)
  if (hex) {
    const digits = (hex[1] ?? "").toLowerCase()
    return `#${digits.length === 3 ? digits.split("").map((digit) => digit + digit).join("") : digits}`
  }
  const rgb = RGB.exec(text)
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map((channel) => Number(channel) / 255)
    return channels.every((channel) => channel <= 1) ? toHex(channels) : null
  }
  const oklch = OKLCH.exec(text)
  if (oklch) {
    const lightness = Number(oklch[1]) / (oklch[2] === "%" ? 100 : 1)
    return oklchToHex(lightness, Number(oklch[3]), Number(oklch[4]))
  }
  return null
}

/** The colours of the named custom properties, in order. Unset or unparsable tokens are skipped; null when fewer than two remain. */
export function readTokenColors(style: ColorSource, tokens: readonly string[]): string[] | null {
  const colors = tokens.flatMap((token) => {
    const color = parseCssColor(style.getPropertyValue(token))
    return color ? [color] : []
  })
  return colors.length >= 2 ? colors : null
}

/** Whether the root carries the `dark` class that the theme-preference lib toggles. */
export function isDarkMode(root: ClassSource): boolean {
  return root.classList.contains("dark")
}

/** The band's colours and brightness for the current theme, or null when the theme tokens are not present. */
export function resolveSweepLook(
  style: ColorSource,
  { dark, tokens = DEFAULT_TOKENS }: { dark: boolean; tokens?: readonly string[] },
): { colors: string[]; brightness: number } | null {
  const colors = readTokenColors(style, tokens)
  return colors ? { colors, brightness: dark ? DARK_BRIGHTNESS : 1 } : null
}
