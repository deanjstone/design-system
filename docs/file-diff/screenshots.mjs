#!/usr/bin/env node
// Render proof for design-system#205: builds the file-diff demo, serves it for the length of the run and
// opens it in ONE headless WebKit page at a time: 390x844 light and dark, 320x844 light and 1280x800 light.
// Checks, per view:
//   - the page does not scroll sideways (documentElement.scrollWidth <= innerWidth)
//   - nothing inside a diff scrolls or clips sideways (scrollWidth <= clientWidth) and no diff sits
//     outside the viewport
//   - the long code line wraps (it is taller than two lines) and is shown in full
//   - below md exactly one line-number column is on screen, from md up two
//   - on phones the diff runs edge to edge in the card: its box matches the card content's box, padding included
// Writes docs/assets/file-diff-<width>-<theme>.png. Exits non-zero if a check fails.
//
//   node docs/file-diff/screenshots.mjs
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { webkit } from "playwright-core"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const assets = path.join(repo, "docs/assets")
const dist = path.join(os.tmpdir(), `file-diff-demo-${process.pid}`)

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, FILE_DIFF_OUT: dist },
})
if (build.status !== 0) throw new Error("file-diff demo build failed")

const VIEWS = [
  { width: 390, height: 844, mobile: true, theme: "light" },
  { width: 390, height: 844, mobile: true, theme: "dark" },
  { width: 320, height: 844, mobile: true, theme: "light" },
  { width: 1280, height: 800, mobile: false, theme: "light" },
]

const { server, origin } = await serve(dist)
const browser = await webkit.launch()
let failures = 0
const record = (name, ok, detail = "") => {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

const measure = () => {
  const diffs = [...document.querySelectorAll('[data-slot="file-diff"]')]
  const cells = [...document.querySelectorAll('[data-slot="file-diff"] *')]
  const longCode = [...document.querySelectorAll('[data-slot="file-diff-code"]')].find((el) => el.textContent.includes("abcdef0123456789abcdef"))
  const longPath = document.querySelector('[data-slot="file-diff-path"]')
  const lineHeight = longCode ? parseFloat(getComputedStyle(longCode).lineHeight) : 20
  const card = document.querySelector('[data-slot="card-content"]')
  const visible = (selector) => [...document.querySelectorAll(selector)].filter((el) => el.getBoundingClientRect().width > 0).length
  return {
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    clipped: cells.filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== "inline").length,
    outside: diffs.filter((el) => { const box = el.getBoundingClientRect(); return box.left < -0.5 || box.right > window.innerWidth + 0.5 }).length,
    codeLines: longCode ? Math.round(longCode.getBoundingClientRect().height / lineHeight) : 0,
    codeInFull: longCode ? longCode.textContent.length > 200 : false,
    pathLines: longPath ? Math.round(longPath.getBoundingClientRect().height / parseFloat(getComputedStyle(longPath).lineHeight)) : 0,
    oldColumns: visible('[data-slot="file-diff-old-line"]') > 0 ? 1 : 0,
    newColumns: visible('[data-slot="file-diff-new-line"]') > 0 ? 1 : 0,
    diffLeft: diffs[0].getBoundingClientRect().left,
    diffWidth: diffs[0].getBoundingClientRect().width,
    cardLeft: card ? card.getBoundingClientRect().left : 0,
    cardWidth: card ? card.getBoundingClientRect().width : 0,
  }
}

try {
  for (const view of VIEWS) {
    const context = await browser.newContext({
      viewport: { width: view.width, height: view.height },
      deviceScaleFactor: view.mobile ? 3 : 1,
      isMobile: view.mobile,
      hasTouch: view.mobile,
    })
    const page = await context.newPage()
    const label = `${view.width}px ${view.theme}`
    await page.goto(`${origin}/?theme=${view.theme}`)
    await page.waitForSelector('[data-slot="file-diff-line"]')
    const m = await page.evaluate(measure)
    record(`${label}: no sideways scroll`, m.overflowX <= 0, `overflow ${m.overflowX}px`)
    record(`${label}: nothing in a diff scrolls or clips sideways`, m.clipped === 0 && m.outside === 0, `${m.clipped} clipped, ${m.outside} outside`)
    record(`${label}: the long code line wraps and is shown in full`, m.codeInFull && m.codeLines >= 2, `${m.codeLines} lines`)
    record(`${label}: the long path wraps`, m.pathLines >= 2, `${m.pathLines} lines`)
    const wantOld = view.width >= 768 ? 1 : 0
    record(`${label}: ${wantOld ? "two" : "one"} line-number column${wantOld ? "s" : ""}`, m.oldColumns === wantOld && m.newColumns === 1, `old ${m.oldColumns}, new ${m.newColumns}`)
    if (view.mobile) record(`${label}: runs edge to edge in the card`, Math.abs(m.diffLeft - m.cardLeft) <= 1 && Math.abs(m.diffWidth - m.cardWidth) <= 1, `diff ${m.diffLeft}+${m.diffWidth}px, card ${m.cardLeft}+${m.cardWidth}px`)
    await page.screenshot({ path: path.join(assets, `file-diff-${view.width}-${view.theme}.png`), fullPage: true })
    await context.close()
  }
} finally {
  await browser.close()
  server.close()
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log("file-diff: all checks passed")
