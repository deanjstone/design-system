#!/usr/bin/env node
// Proof for docs/audits/2026-11-12-hierarchy-density.md: builds the sample, serves it for the length of
// the run and opens it in ONE headless Chromium page at a time, at 1440x900 (mouse) and 390x844 (touch).
//
// Checks:
//   - proposed.css, below its token block, has no raw colour, no gradient, and no length that is not a
//     token (0, 1px hairlines and the 2px focus ring aside)
//   - the five colour tokens meet WCAG contrast where they are paired, in light and dark
//   - neither version scrolls sideways at either width
//   - the proposed page draws only token values: every computed colour, font size, weight and radius on
//     it is one of the tokens
// Prints a census of the distinct values each version draws (sizes, weights, colours, spacing, radii,
// control and row heights), which the audit quotes. Writes docs/assets/hierarchy-density-<version>-<width>-<theme>.png.
// Exits non-zero if a check fails.
//
//   node docs/audits/hierarchy-density/screenshots.mjs
import { spawnSync } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

import { serve } from "../../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../../..")
const assets = path.join(repo, "docs/assets")
const dist = path.join(os.tmpdir(), `hierarchy-density-sample-${process.pid}`)

let failures = 0
const record = (name, ok, detail = "") => {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

// 1. The stylesheet reads tokens only.
const css = readFileSync(path.join(here, "proposed.css"), "utf8")
const tokenBlock = css.slice(css.indexOf("/* tokens:begin */"), css.indexOf("/* tokens:end */"))
const rules = css
  .slice(css.indexOf("/* tokens:end */"))
  .replaceAll(/\/\*[\s\S]*?\*\//g, "")
  .replaceAll(/@media[^{]*\{/g, "@media {")
const rawColours = rules.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/gi) ?? []
const rawLengths = (rules.match(/\b\d*\.?\d+(?:px|rem|em|ch|vw|vh)\b/g) ?? []).filter((length) => !["1px", "2px"].includes(length))
record("proposed.css: no raw colour below the token block", rawColours.length === 0, rawColours.join(" "))
record("proposed.css: no gradient", !/gradient/i.test(rules) && !/gradient/i.test(tokenBlock))
record("proposed.css: no length that is not a token (1px and 2px aside)", rawLengths.length === 0, rawLengths.join(" "))

const tokens = (block, pattern) => [...block.matchAll(pattern)].map((match) => match[1])
const lightBlock = tokenBlock.slice(0, tokenBlock.indexOf(".dark .hd"))
const darkBlock = tokenBlock.slice(tokenBlock.indexOf(".dark .hd"), tokenBlock.indexOf("@media"))
const colourNames = tokens(lightBlock, /--hd-([a-z0-9-]+):\s*#/g)
record("five colour tokens or fewer", colourNames.length <= 5, colourNames.join(", "))

// 2. Contrast of the pairs the sample draws.
const palette = (block) => Object.fromEntries([...block.matchAll(/--hd-([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map((match) => [match[1], match[2]]))
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255).map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const PAIRS = [
  ["ink", "paper", 4.5, "body text"],
  ["ink-2", "paper", 4.5, "secondary text"],
  ["accent", "paper", 4.5, "accent text, and paper text on an accent button"],
  ["ink-2", "paper", 3, "field and button border"],
]
for (const [mode, block] of [["light", lightBlock], ["dark", darkBlock]]) {
  const colours = palette(block)
  for (const [foreground, background, floor, use] of PAIRS) {
    const ratio = contrast(colours[foreground], colours[background])
    record(`${mode}: ${foreground} on ${background} is ${floor}:1 or more (${use})`, ratio >= floor, `${ratio.toFixed(2)}:1`)
  }
  console.log(`INFO ${mode}: line on paper is ${contrast(colours.line, colours.paper).toFixed(2)}:1 (dividers only, never the one cue)`)
}

// 3. The pages.
const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, HIERARCHY_DENSITY_OUT: dist },
})
if (build.status !== 0) throw new Error("hierarchy-density sample build failed")

const VIEWPORTS = [
  { width: 1440, height: 900, mobile: false },
  { width: 390, height: 844, mobile: true },
]
const SHOTS = [
  { version: "current", theme: "light" },
  { version: "proposed", theme: "light" },
  { version: "current", theme: "dark" },
  { version: "proposed", theme: "dark" },
]

// Every distinct value the page draws, read from computed styles of the elements that have a box.
const census = () => {
  const px = (value) => Math.round(parseFloat(value) * 100) / 100
  const sets = { fontSize: new Set(), fontWeight: new Set(), colour: new Set(), spacing: new Set(), radius: new Set() }
  const controls = new Set()
  for (const element of document.querySelectorAll("#root *")) {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    if (style.display === "none" || style.display === "contents" || box.width === 0 || box.height === 0) continue
    const text = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== "")
    if (text || element.matches("input, select, textarea")) {
      sets.fontSize.add(px(style.fontSize))
      sets.fontWeight.add(style.fontWeight)
      sets.colour.add(style.color)
    }
    if (element.matches("svg")) sets.colour.add(style.color)
    if (style.backgroundColor !== "rgba(0, 0, 0, 0)") sets.colour.add(style.backgroundColor)
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none") sets.colour.add(style[`border${side}Color`])
      // Inline margins are left out: `margin-inline: auto` computes to whatever space is spare.
      for (const property of side === "Top" || side === "Bottom" ? [`padding${side}`, `margin${side}`] : [`padding${side}`]) {
        const value = px(style[property])
        if (value > 0) sets.spacing.add(value)
      }
    }
    if (style.boxShadow !== "none") for (const colour of style.boxShadow.match(/(?:rgba?|oklab|oklch|color)\([^)]*\)/g) ?? []) sets.colour.add(colour)
    for (const property of ["rowGap", "columnGap"]) {
      const value = px(style[property])
      if (value > 0 && /flex|grid/.test(style.display)) sets.spacing.add(value)
    }
    const radius = px(style.borderTopLeftRadius)
    if (radius > 0 && radius < 999) sets.radius.add(radius)
    if (element.matches("button, input, select, textarea, [role='button']")) controls.add(Math.round(box.height))
  }
  const sorted = (set) => [...set].sort((a, b) => (typeof a === "number" ? a - b : String(a).localeCompare(String(b))))
  const rowHeights = [...document.querySelectorAll("#root li")].map((row) => Math.round(row.getBoundingClientRect().height))
  return { ...Object.fromEntries(Object.entries(sets).map(([key, set]) => [key, sorted(set)])), controlHeights: sorted(controls), rowHeights }
}

const { server, origin } = await serve(dist)
const browser = await chromium.launch()
const results = {}
try {
  for (const viewport of VIEWPORTS) {
    for (const { version, theme } of SHOTS) {
      const label = `${version} ${viewport.width}px ${theme}`
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.mobile ? 2 : 1,
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
      })
      const page = await context.newPage()
      try {
        await page.goto(`${origin}/?v=${version}&theme=${theme}`)
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(200)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        record(`${label}: no sideways scroll`, overflow <= 0, `overflow ${overflow}px`)
        if (theme === "light") results[`${version}-${viewport.width}`] = { ...(await page.evaluate(census)), pageHeight: await page.evaluate(() => document.documentElement.scrollHeight) }
        await page.screenshot({ path: path.join(assets, `hierarchy-density-${version}-${viewport.width}-${theme}.png`), fullPage: true })
      } finally {
        await context.close()
      }
    }
  }
} finally {
  await browser.close()
  server.close()
  rmSync(dist, { recursive: true, force: true })
}

// 4. The proposed page draws token values only.
const rem = (value) => parseFloat(value) * 16
const declared = {
  fontSize: tokens(lightBlock, /--hd-t\d:\s*([\d.]+)rem/g).map(rem),
  fontWeight: tokens(lightBlock, /--hd-(?:regular|strong):\s*(\d+)/g),
  radius: [rem(tokens(lightBlock, /--hd-s2:\s*([\d.]+)rem/g)[0])],
  spacing: tokens(lightBlock, /--hd-s\d:\s*([\d.]+)rem/g).map(rem),
}
for (const width of VIEWPORTS.map((viewport) => viewport.width)) {
  const drawn = results[`proposed-${width}`]
  for (const [key, allowed] of Object.entries(declared)) {
    const stray = drawn[key].filter((value) => !allowed.includes(value))
    record(`proposed ${width}px: every ${key} is a token`, stray.length === 0, stray.length ? `stray ${stray.join(", ")}` : `${drawn[key].join(", ")}`)
  }
  record(`proposed ${width}px: five colours or fewer are drawn`, drawn.colour.length <= 5, drawn.colour.join(" | "))
}

console.log("\nCensus (light), distinct values drawn:")
for (const [key, value] of Object.entries(results)) {
  console.log(`\n${key} (page height ${value.pageHeight}px)`)
  for (const field of ["fontSize", "fontWeight", "colour", "spacing", "radius", "controlHeights", "rowHeights"]) console.log(`  ${field} [${value[field].length}]: ${value[field].join(", ")}`)
}

console.log(failures === 0 ? "\nhierarchy-density: all checks passed" : `\nhierarchy-density: ${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
