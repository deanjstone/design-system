#!/usr/bin/env node
// Rendered proof for design-system#147: with emulateMedia({ reducedMotion: 'reduce' })
// document.getAnimations() holds no looping animation, a sheet or drawer in its
// entering/leaving state no longer carries a slide, and prefers-contrast: more raises
// the border, input and muted-foreground tokens. Compiles the real component
// classes with Tailwind, loads them into Playwright Chromium and prints the result.
//
//   node scripts/verify-reduced-motion.mjs
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname } from "node:path"
import { compile } from "tailwindcss"
import { chromium } from "playwright-core"

const require = createRequire(import.meta.url)
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const classesOf = (path, pattern) => read(path).match(pattern)?.[1]
const loadStylesheet = async (id, base) => {
  const file = id === "tailwindcss" ? require.resolve("tailwindcss/index.css") : require.resolve(id, { paths: [base] })
  return { path: file, base: dirname(file), content: readFileSync(file, "utf8") }
}

const spinner = classesOf("registry/base-nova/ui/spinner.tsx", /cn\("([^"]+)"/)
const skeleton = classesOf("registry/base-nova/ui/skeleton.tsx", /cn\("([^"]+)"/)
const sonner = classesOf("registry/base-nova/ui/sonner.tsx", /<Loader2Icon className="([^"]+)"/)
const sheet = classesOf("registry/base-nova/ui/sheet.tsx", /"(fixed z-50 flex flex-col[^"]+)"/)
const popupBlock = read("registry/base-nova/ui/drawer.tsx").match(/data-slot="drawer-popup"[\s\S]*?className=\{cn\(([\s\S]*?)\n          \)\}/)[1]
const drawer = [...popupBlock.matchAll(/^\s*"([^"\n]+)"/gm)].map((match) => match[1]).join(" ")

const candidates = [spinner, skeleton, sonner, sheet, drawer].flatMap((value) => value.split(/\s+/))
const compiler = await compile('@import "tailwindcss";', { base: process.cwd(), loadStylesheet })
const css = compiler.build(candidates)

const html = `<style>${css}</style>
<span id="spinner" class="${spinner}"></span>
<div id="skeleton" class="${skeleton}" style="width:40px;height:10px"></div>
<span id="sonner" class="${sonner}"></span>
<div id="sheet" data-side="right" data-ending-style class="${sheet}"></div>
<div id="drawer" data-ending-style data-swipe-direction="down" style="--closed-transform:translate3d(0,100%,0);transition:none" class="${drawer}"></div>`

const looping = (page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.effect.getComputedTiming().iterations === Infinity)
      .map((animation) => animation.animationName),
  )
const styleOf = (page, id, property) => page.evaluate(([target, name]) => getComputedStyle(document.getElementById(target))[name], [id, property])

const browser = await chromium.launch()
const results = {}
for (const reducedMotion of ["no-preference", "reduce"]) {
  const page = await browser.newPage()
  await page.emulateMedia({ reducedMotion })
  await page.setContent(html)
  results[reducedMotion] = {
    loopingAnimations: await looping(page),
    sheetTranslate: await styleOf(page, "sheet", "translate"),
    drawerTransform: await styleOf(page, "drawer", "transform"),
    drawerOpacity: await styleOf(page, "drawer", "opacity"),
  }
  await page.close()
}

// prefers-contrast: more, against the real tokens.css: a dark Forest-style block
// (two-part selector) must still be raised.
const tokens = read("theme/tokens.css")
const contrastHtml = `<style>${tokens.slice(tokens.indexOf("@media (prefers-contrast: more)"), tokens.indexOf("/*\n * Coarse-pointer sizing."))}
:root{--foreground:#fff;--background:#000;--border:#222;--input:#222;--muted-foreground:#444}
[data-theme="x"].dark{--foreground:#fff;--background:#000;--border:#222;--input:#222;--muted-foreground:#444}</style>
<div id="light"></div><div id="themed" data-theme="x" class="dark"></div>`
for (const contrast of ["no-preference", "more"]) {
  const page = await browser.newPage()
  await page.emulateMedia({ contrast })
  await page.setContent(contrastHtml)
  const read3 = (id) => page.evaluate((target) => ["--border", "--input", "--muted-foreground"].map((name) => getComputedStyle(document.getElementById(target)).getPropertyValue(name).trim()), id)
  results[`contrast-${contrast}`] = { root: await read3("light"), themedDark: await read3("themed") }
  await page.close()
}
await browser.close()
console.log(JSON.stringify(results, null, 2))

const { reduce, "no-preference": normal } = results
const failures = []
if (normal.loopingAnimations.length === 0) failures.push("control: no looping animation without the preference, so the check proves nothing")
if (reduce.loopingAnimations.length !== 0) failures.push(`looping animations under reduce: ${reduce.loopingAnimations}`)
if (reduce.sheetTranslate !== "none") failures.push(`sheet still translates under reduce: ${reduce.sheetTranslate}`)
if (reduce.drawerTransform !== "none") failures.push(`drawer still transforms under reduce: ${reduce.drawerTransform}`)
if (reduce.drawerOpacity !== "0") failures.push(`drawer does not fade under reduce: ${reduce.drawerOpacity}`)
const raised = results["contrast-more"]
const base = results["contrast-no-preference"]
for (const key of ["root", "themedDark"]) {
  if (JSON.stringify(base[key]) !== JSON.stringify(["#222", "#222", "#444"])) failures.push(`control: ${key} tokens changed without the preference: ${base[key]}`)
  if (raised[key].some((value) => !value.startsWith("color-mix"))) failures.push(`prefers-contrast: more did not raise ${key}: ${raised[key]}`)
}
if (failures.length) {
  console.error(failures.join("\n"))
  process.exit(1)
}
console.log("verify-reduced-motion: pass")
