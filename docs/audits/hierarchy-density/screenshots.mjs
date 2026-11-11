#!/usr/bin/env node
// Proof for docs/audits/2026-11-12-hierarchy-density.md: builds the sample, serves it for the length of
// the run and opens it in ONE headless Chromium page at a time, at 1440x900 (mouse) and 390x844 (touch).
//
// Checks:
//   - proposed.css, below its token block, has no raw colour and no length that is not a token (0, 1px
//     hairlines and the 2px focus ring aside), and every colour it reads is a token theme/tokens.css declares
//   - neither version scrolls sideways at either width, in light, dark or a second theme
//   - the proposed page draws only scale values: every computed font size, weight, radius and spacing on
//     it is one of the tokens
// Prints a census of the distinct values each version draws (sizes, weights, colours, spacing, radii,
// control and row heights), which the audit quotes. Writes docs/assets/hierarchy-density-<version>-<width>-<theme>.png
// and hierarchy-density-<version>-1440-grove.png. Exits non-zero if a check fails.
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
record("proposed.css: no length that is not a token (1px and 2px aside)", rawLengths.length === 0, rawLengths.join(" "))

// Colour is the theme's: every custom property read that is not one of the scale's own must be declared in theme/tokens.css.
const themeCss = readFileSync(path.join(repo, "theme/tokens.css"), "utf8")
const themeTokens = new Set([...themeCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]))
const colourTokens = [...new Set([...rules.matchAll(/var\((--(?!hd-)[a-z0-9-]+)\)/g)].map((match) => match[1]))].sort()
const unknown = colourTokens.filter((token) => !themeTokens.has(token))
record("proposed.css: every colour is a theme token", unknown.length === 0, unknown.length ? `not in theme/tokens.css: ${unknown.join(" ")}` : colourTokens.join(" "))
record("proposed.css: the token block declares no colour", !/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/i.test(tokenBlock))

const tokens = (block, pattern) => [...block.matchAll(pattern)].map((match) => match[1])
const lightBlock = tokenBlock

// 2. The pages.
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
  // A second theme, to show the proposed screen takes its colour from whichever theme is set.
  { version: "current", theme: "light", palette: "grove", only: 1440 },
  { version: "proposed", theme: "light", palette: "grove", only: 1440 },
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
    for (const { version, theme, palette, only } of SHOTS) {
      if (only && only !== viewport.width) continue
      const label = `${version} ${viewport.width}px ${palette ?? theme}`
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.mobile ? 2 : 1,
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
      })
      const page = await context.newPage()
      try {
        await page.goto(`${origin}/?v=${version}&theme=${theme}${palette ? `&palette=${palette}` : ""}`)
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(200)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        record(`${label}: no sideways scroll`, overflow <= 0, `overflow ${overflow}px`)
        if (theme === "light" && !palette) results[`${version}-${viewport.width}`] = { ...(await page.evaluate(census)), pageHeight: await page.evaluate(() => document.documentElement.scrollHeight) }
        await page.screenshot({ path: path.join(assets, `hierarchy-density-${version}-${viewport.width}-${palette ?? theme}.png`), fullPage: true })
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

// 3. The proposed page draws scale values only.
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
  console.log(`INFO proposed ${width}px draws ${drawn.colour.length} colours, current ${results[`current-${width}`].colour.length}`)
}

console.log("\nCensus (light), distinct values drawn:")
for (const [key, value] of Object.entries(results)) {
  console.log(`\n${key} (page height ${value.pageHeight}px)`)
  for (const field of ["fontSize", "fontWeight", "colour", "spacing", "radius", "controlHeights", "rowHeights"]) console.log(`  ${field} [${value[field].length}]: ${value[field].join(", ")}`)
}

console.log(failures === 0 ? "\nhierarchy-density: all checks passed" : `\nhierarchy-density: ${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
