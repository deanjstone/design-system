// Pure measurement helpers for the primitives usage audit: they take source text and
// return counts. Nothing here touches git or the filesystem, so test/primitives-usage.test.ts
// can pin the parsing without a consumer checkout.

// The scale design-system#207 proposes. 0 and "full" are neither on nor off the scale:
// a zero gap and a pill or circle are not steps anyone would migrate.
export const SCALE = {
  type: [12, 14, 16, 20, 28],
  weight: [400, 600],
  spacing: [4, 8, 12, 16, 24, 32, 48],
  radius: [8],
}

const TAILWIND_TEXT = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128 }
const TAILWIND_RADIUS = { xs: 2, sm: 4, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24, "4xl": 32 }
const WEIGHTS = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 }
const PALETTE = /^(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}$/
const COLOUR_UTILITY = /^(?:bg|text|border(?:-[trblxyse])?|ring|ring-offset|fill|stroke|outline|from|to|via|divide|decoration|accent|caret|shadow|placeholder)-(.+)$/
const SPACING_UTILITY = /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])-(.+)$/
const SIZE_UTILITY = /^(?:w|h|min-w|min-h|max-w|max-h|size|inset(?:-[xy])?|top|right|bottom|left|basis|translate-[xy]|leading|tracking)-/
const HEIGHT_UTILITY = /^(h|min-h|size)-(.+)$/
const RAW_COLOUR_FN = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/g
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/

// "0.875rem" -> 14, "13px" -> 13, "max(1rem,16px)" -> 16. Null when there is no fixed length
// (a var(), a percentage, a calc over a var).
export function toPx(value, vars = {}) {
  const text = String(value).trim().replaceAll("_", " ")
  if (/^-?\d*\.?\d+$/.test(text)) return Number(text)
  const single = /^(-?\d*\.?\d+)(px|rem|em)$/.exec(text)
  if (single) return round(Number(single[1]) * (single[2] === "px" ? 1 : 16))
  const reference = /^var\((--[\w-]+)\)$/.exec(text)
  if (reference && vars[reference[1]] !== undefined) return toPx(vars[reference[1]], vars)
  const calc = /^calc\((.+?)\s+([+-])\s+(.+)\)$/.exec(text)
  if (calc) {
    const left = toPx(calc[1], vars)
    const right = toPx(calc[3], vars)
    if (left === null || right === null) return null
    return round(calc[2] === "+" ? left + right : left - right)
  }
  const limit = /^(max|min)\((.+)\)$/.exec(text)
  if (limit) {
    const parts = limit[2].split(",").map((part) => toPx(part, vars))
    if (parts.some((part) => part === null)) return null
    return limit[1] === "max" ? Math.max(...parts) : Math.min(...parts)
  }
  return null
}

function round(value) {
  return Math.round(value * 100) / 100
}

// Custom properties declared in a stylesheet. The first declaration wins: that is the bare
// :root value, ahead of any theme or [data-theme] override further down. Enough to read
// --radius, --radius-lg and the --text-* steps a theme sets.
export function cssVariables(css) {
  const vars = {}
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)[;}]/g)) vars[match[1]] ??= match[2].trim()
  return vars
}

// "prop:value" with no whitespace, the key a declaration is compared by.
export function declarationKey(property, value) {
  return `${property}:${String(value).replace(/\s+/g, "")}`
}

// The px value of each text-* and rounded-* step for one app: Tailwind's defaults,
// overridden by whatever the app's own CSS declares.
export function scaleFor(vars) {
  const text = { ...TAILWIND_TEXT }
  const radius = { ...TAILWIND_RADIUS }
  for (const [name, value] of Object.entries(vars)) {
    const textStep = /^--text-([\w]+)$/.exec(name)
    if (textStep) {
      const px = toPx(value, vars)
      if (px !== null) text[textStep[1]] = px
    }
    const radiusStep = /^--radius-([\w]+)$/.exec(name)
    if (radiusStep) {
      const px = toPx(value, vars)
      if (px !== null) radius[radiusStep[1]] = px
    }
  }
  return { text, radius }
}

// Every whitespace- or quote-separated token in a source file. Class names sit in strings
// (className, cva(), cn(), constants), and a string-literal parser loses its place on the
// first apostrophe in JSX text, so this splits on quotes too and lets the utility patterns
// decide what is a class.
export function classTokens(source) {
  return source.split(/[\s"'`]+/).map((token) => token.replace(/[}>,;]+$/, "")).filter(Boolean)
}

// "md:hover:-mt-[3px]!" -> { utility: "mt-[3px]", variants: ["md", "hover"] }
export function splitToken(token) {
  const parts = []
  let depth = 0
  let current = ""
  for (const char of token) {
    if (char === "[" || char === "(") depth += 1
    if (char === "]" || char === ")") depth -= 1
    if (char === ":" && depth === 0) {
      parts.push(current)
      current = ""
    } else current += char
  }
  const utility = current.replace(/^!/, "").replace(/!$/, "").replace(/^-/, "")
  return { utility, variants: parts }
}

function arbitrary(value) {
  const square = /^\[(.+)\]$/.exec(value)
  if (square) return { raw: square[1], backed: /var\(|^--/.test(square[1]) }
  const paren = /^\((--.+)\)$/.exec(value)
  if (paren) return { raw: paren[1], backed: true }
  return null
}

function emptyCounts() {
  return {
    fontSize: {},
    fontWeight: {},
    spacing: {},
    radius: {},
    height: {},
    // The subset of the histograms above written as a literal (an arbitrary value, an inline
    // style or a CSS declaration) and not as a named step a theme could remap.
    fontSizeLiteral: {},
    fontWeightLiteral: {},
    radiusLiteral: {},
    semanticColourClasses: 0,
    paletteColourClasses: 0,
    arbitraryLiteral: { text: 0, spacing: 0, size: 0, radius: 0, colour: 0, other: 0 },
    arbitraryVarBacked: 0,
    arbitraryExamples: {},
    rawColours: 0,
    rawColourExamples: {},
    inlineStyleLiterals: 0,
    inlineStyleVarBacked: 0,
    tokenVarUses: 0,
    localVarUses: 0,
  }
}

function bump(histogram, key, by = 1) {
  histogram[key] = (histogram[key] ?? 0) + by
}

function isColourValue(raw) {
  return HEX.test(raw) || /^(?:rgba?|hsla?|oklch|oklab|color-mix)\(/.test(raw)
}

// Classifies one Tailwind class and adds it to the counts.
export function countClass(token, counts, scale, semanticColours) {
  const { utility } = splitToken(token)
  if (!/^[a-z]/.test(utility)) return false

  const textStep = /^text-(.+)$/.exec(utility)
  if (textStep) {
    const value = textStep[1].split("/")[0]
    if (scale.text[value] !== undefined) return bump(counts.fontSize, scale.text[value]), true
    const custom = arbitrary(value)
    if (custom && !isColourValue(custom.raw) && !custom.backed) {
      const px = toPx(custom.raw.replace(/^length:/, ""))
      if (px !== null) {
        bump(counts.fontSize, px)
        bump(counts.fontSizeLiteral, px)
        counts.arbitraryLiteral.text += 1
        bump(counts.arbitraryExamples, token)
        return true
      }
    }
  }

  const weight = /^font-(.+)$/.exec(utility)
  if (weight) {
    if (WEIGHTS[weight[1]] !== undefined) return bump(counts.fontWeight, WEIGHTS[weight[1]]), true
    const custom = arbitrary(weight[1])
    if (custom && /^\d{3}$/.test(custom.raw)) return bump(counts.fontWeight, Number(custom.raw)), bump(counts.fontWeightLiteral, Number(custom.raw)), true
  }

  const spacing = SPACING_UTILITY.exec(utility)
  if (spacing) {
    const value = spacing[1]
    if (/^\d*\.?\d+$/.test(value)) return bump(counts.spacing, round(Number(value) * 4)), true
    if (value === "px") return bump(counts.spacing, 1), true
    const custom = arbitrary(value)
    if (custom) {
      if (custom.backed) return (counts.arbitraryVarBacked += 1), true
      counts.arbitraryLiteral.spacing += 1
      bump(counts.arbitraryExamples, token)
      const px = toPx(custom.raw)
      if (px !== null) bump(counts.spacing, px)
      return true
    }
    return false
  }

  const rounded = /^rounded(?:-(?:[trbl]|tl|tr|br|bl|[se]|ss|se|es|ee))?(?:-(.+))?$/.exec(utility)
  if (rounded) {
    const value = rounded[1]
    if (value === undefined) return bump(counts.radius, 4), true
    if (value === "none") return bump(counts.radius, 0), true
    if (value === "full") return bump(counts.radius, "full"), true
    if (scale.radius[value] !== undefined) return bump(counts.radius, scale.radius[value]), true
    const custom = arbitrary(value)
    if (custom) {
      if (custom.backed) return (counts.arbitraryVarBacked += 1), true
      counts.arbitraryLiteral.radius += 1
      bump(counts.arbitraryExamples, token)
      const px = toPx(custom.raw)
      if (px !== null) bump(counts.radius, px), bump(counts.radiusLiteral, px)
      return true
    }
    return false
  }

  const height = HEIGHT_UTILITY.exec(utility)
  if (height) {
    const value = height[2]
    const custom = arbitrary(value)
    const px = /^\d*\.?\d+$/.test(value) ? Number(value) * 4 : custom && !custom.backed ? toPx(custom.raw) : null
    if (px !== null && px >= 24 && px <= 64) bump(counts.height, `${height[1]}:${px}`)
  }

  const colour = COLOUR_UTILITY.exec(utility)
  if (colour) {
    const name = colour[1].split("/")[0]
    if (semanticColours.has(name)) return (counts.semanticColourClasses += 1), true
    if (PALETTE.test(name) || name === "white" || name === "black") return (counts.paletteColourClasses += 1), true
    const custom = arbitrary(name)
    if (custom && isColourValue(custom.raw)) {
      counts.arbitraryLiteral.colour += 1
      bump(counts.arbitraryExamples, token)
      return true
    }
  }

  const bracket = /-(\[.+\]|\(--.+\))$/.exec(utility)
  if (bracket) {
    const custom = arbitrary(bracket[1])
    if (!custom) return false
    if (custom.backed) return (counts.arbitraryVarBacked += 1), true
    if (textStep) return false
    counts.arbitraryLiteral[SIZE_UTILITY.test(utility) ? "size" : "other"] += 1
    bump(counts.arbitraryExamples, token)
    return true
  }
  return false
}

const STYLE_SIZE_KEYS = /\b(fontSize|lineHeight|width|height|minWidth|minHeight|maxWidth|maxHeight|padding\w*|margin\w*|gap|rowGap|columnGap|borderRadius|top|left|right|bottom|inset\w*)\s*:\s*(-?\d+(?:\.\d+)?\b|"[^"]*"|'[^']*'|`[^`]*`)/g

// Inline `style={{ ... }}` objects: each sizing key with a literal value is one hardcoded size.
export function countInlineStyles(source, counts) {
  for (const match of source.matchAll(/style=\{\{/g)) {
    let depth = 2
    let end = match.index + match[0].length
    while (end < source.length && depth > 0) {
      if (source[end] === "{") depth += 1
      if (source[end] === "}") depth -= 1
      end += 1
    }
    const body = source.slice(match.index, end)
    for (const pair of body.matchAll(STYLE_SIZE_KEYS)) {
      const value = pair[2].replace(/^["'`]|["'`]$/g, "")
      if (/var\(|\$\{/.test(value)) {
        counts.inlineStyleVarBacked += 1
        continue
      }
      if (!/^-?\d/.test(value)) continue
      counts.inlineStyleLiterals += 1
      const px = toPx(value)
      if (px === null) continue
      if (pair[1] === "fontSize") bump(counts.fontSize, px), bump(counts.fontSizeLiteral, px)
      if (pair[1] === "borderRadius") bump(counts.radius, px), bump(counts.radiusLiteral, px)
      if (/^(padding|margin|gap|rowGap|columnGap)/.test(pair[1])) bump(counts.spacing, px)
    }
  }
}

// One script or component file: classes, raw colours, inline styles and var() uses.
export function measureScript(source, { scale, semanticColours, tokenNames }) {
  const counts = emptyCounts()
  for (const token of classTokens(source)) countClass(token, counts, scale, semanticColours)
  for (const match of source.matchAll(/["'`](#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4}))["'`]/g)) {
    counts.rawColours += 1
    bump(counts.rawColourExamples, match[1].toLowerCase())
  }
  for (const match of source.matchAll(RAW_COLOUR_FN)) {
    counts.rawColours += 1
    bump(counts.rawColourExamples, `${match[0]}…)`)
  }
  countInlineStyles(source, counts)
  countVarUses(source, counts, tokenNames)
  return counts
}

function countVarUses(source, counts, tokenNames) {
  for (const match of source.matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (tokenNames.has(match[1])) counts.tokenVarUses += 1
    else counts.localVarUses += 1
  }
}

const CSS_SPACING = /^(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$/

// One stylesheet. A declaration the registry ships (`registryDeclarations`, keyed by
// declarationKey) is the installed theme, not app code, and is only counted as such.
export function measureCss(css, { tokenNames, vars = {}, registryDeclarations = new Set() }) {
  const counts = emptyCounts()
  counts.localTokenDefinitions = 0
  counts.registryDeclarations = 0
  let authored = ""
  for (const match of css.matchAll(/(?:^|[;{\s])(--[\w-]+|[a-z][a-z-]*)\s*:\s*([^;{}]+)(?=[;}])/g)) {
    const property = match[1]
    const value = match[2].trim()
    if (registryDeclarations.has(declarationKey(property, value))) {
      counts.registryDeclarations += 1
      continue
    }
    authored += `${value}\n`
    if (property.startsWith("--")) {
      counts.localTokenDefinitions += 1
      continue
    }
    const colours = [...value.matchAll(RAW_COLOUR_FN)].length + [...value.matchAll(new RegExp(HEX, "g"))].length
    if (colours > 0) {
      counts.rawColours += colours
      bump(counts.rawColourExamples, `${property}: ${value}`.slice(0, 60))
    }
    if (property === "font-size") {
      const px = toPx(value, vars)
      if (px !== null) bump(counts.fontSize, px), bump(counts.fontSizeLiteral, px)
    }
    const weight = property === "font-weight" ? (/^\d{3}$/.test(value) ? Number(value) : WEIGHTS[value]) : undefined
    if (weight !== undefined) bump(counts.fontWeight, weight), bump(counts.fontWeightLiteral, weight)
    if (CSS_SPACING.test(property)) {
      for (const part of value.split(/\s+/)) {
        const px = toPx(part, vars)
        if (px !== null) bump(counts.spacing, px)
      }
    }
    if (property === "border-radius") {
      for (const part of value.split(/\s+/)) {
        const px = toPx(part, vars)
        if (px !== null) bump(counts.radius, px >= 999 ? "full" : px), bump(counts.radiusLiteral, px >= 999 ? "full" : px)
      }
    }
    if (property === "height" || property === "min-height") {
      const px = toPx(value, vars)
      if (px !== null && px >= 24 && px <= 64) bump(counts.height, `${property === "height" ? "h" : "min-h"}:${px}`)
    }
  }
  countVarUses(authored, counts, tokenNames)
  return counts
}

export function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number") target[key] = (target[key] ?? 0) + value
    else {
      target[key] ??= {}
      for (const [inner, count] of Object.entries(value)) bump(target[key], inner, count)
    }
  }
  return target
}

export { emptyCounts }

// Splits a histogram into on-scale, off-scale and neutral (0, 1px hairline, full) occurrences.
export function againstScale(histogram, allowed) {
  const result = { on: 0, off: 0, neutral: 0, offValues: {} }
  for (const [key, count] of Object.entries(histogram)) {
    if (key === "full" || Number(key) === 0) result.neutral += count
    else if (allowed.includes(Number(key))) result.on += count
    else {
      result.off += count
      result.offValues[key] = count
    }
  }
  return result
}

// Import specifiers in a module, with the line each sits on.
export function importsOf(source) {
  const found = []
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\w*\s{},$]+?\s+from\s+)?["']([^"'\n]+)["']/g,
    /\bexport\s+(?:type\s+)?[\w*\s{},$]+?\s+from\s+["']([^"'\n]+)["']/g,
    /\bimport\(\s*["']([^"'\n]+)["']\s*\)/g,
    /@import\s+(?:url\()?["']([^"'\n]+)["']/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      found.push({ specifier: match[1], line: source.slice(0, match.index).split("\n").length })
    }
  }
  return found
}

// Component names a file declares: `function Name(` and `const Name = (` / memo / forwardRef.
export function componentsOf(source) {
  const found = []
  const patterns = [
    /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9]*)\s*[(<]/g,
    /(?:^|\n)\s*(?:export\s+)?const\s+([A-Z][A-Za-z0-9]*)\s*(?::[^=\n]+)?=\s*(?:React\.)?(?:memo|forwardRef|lazy)?\(?\s*(?:async\s*)?(?:\(|function\b)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      found.push({ name: match[1], line: source.slice(0, match.index).split("\n").length + (match[0].startsWith("\n") ? 1 : 0) })
    }
  }
  return found
}

// What the shadcn CLI changes on install, undone so a consumer copy can be compared with
// the registry source: the "use client" directive (dropped when rsc is false), a leading
// comment block, and the cn-* marker classes and font-heading (removed by the style
// transform, which also reflows the cn() call they sat in).
// The comment is only stripped from the registry side: a comment a consumer added is an edit.
export function normaliseSource(source, { stripLeadingComment = false } = {}) {
  const body = source.replaceAll("\r\n", "\n").replace(/^\s*["']use client["'];?\s*\n+/, "")
  const uncommented = stripLeadingComment ? body.replace(/^(?:\s*\/\/[^\n]*\n)+/, "").replace(/^\s*\/\*[\s\S]*?\*\/\s*\n/, "") : body
  return uncommented
    .replace(/\s?\b(?:cn-[a-z-]+|font-heading)\b/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}

// Two copies with the same fingerprint differ only in whitespace and the transforms above.
export function fingerprint(source, options) {
  return normaliseSource(source, options).replace(/\s+/g, "")
}
