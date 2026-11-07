#!/usr/bin/env node
// Render proof for design-system#188: builds the card-list demo, serves it for the length of the run
// and opens it in ONE headless WebKit page at a time, at 390x844, 320x844 and 1280x800, light and dark.
// Checks, per view:
//   - the page does not scroll sideways (documentElement.scrollWidth <= innerWidth)
//   - every card is at least 44px tall and sits inside the viewport
//   - the long title and the long branch are cut (their scrollWidth exceeds their clientWidth)
//   - the active card is raised: it has a box-shadow and aria-current
// Writes docs/assets/card-list-<width>-<theme>.png plus card-list-before-<width>-light.png, the
// single-row list the cards replace. Exits non-zero if a check fails.
//
//   node docs/card-list/screenshots.mjs
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { webkit } from "playwright-core"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const assets = path.join(repo, "docs/assets")
const dist = path.join(os.tmpdir(), `card-list-demo-${process.pid}`)

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, CARD_LIST_OUT: dist },
})
if (build.status !== 0) throw new Error("card-list demo build failed")

const VIEWPORTS = [
  { width: 390, height: 844, mobile: true },
  { width: 320, height: 844, mobile: true },
  { width: 1280, height: 800, mobile: false },
]
const THEMES = ["light", "dark"]

const { server, origin } = await serve(dist)
const browser = await webkit.launch()
let failures = 0
const record = (name, ok, detail = "") => {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

const measure = () => {
  const cards = [...document.querySelectorAll('[data-slot="card-list-item"]')]
  const longTitle = [...document.querySelectorAll('[data-slot="card-list-item-title"]')].find((el) => el.textContent.startsWith("Promote the ops-hub"))
  const longBranch = [...document.querySelectorAll('[data-slot="card-list-item-branch"]')].find((el) => el.textContent.startsWith("feat/1084"))
  const active = document.querySelector('[data-slot="card-list-item"][aria-current="true"]')
  return {
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    cardCount: cards.length,
    shortest: Math.min(...cards.map((card) => card.getBoundingClientRect().height)),
    outside: cards.filter((card) => {
      const box = card.getBoundingClientRect()
      return box.left < 0 || box.right > window.innerWidth
    }).length,
    titleCut: longTitle ? longTitle.scrollWidth > longTitle.clientWidth : false,
    branchCut: longBranch ? longBranch.scrollWidth > longBranch.clientWidth : false,
    activeShadow: active ? getComputedStyle(active).boxShadow : "none",
    emptyGroups: document.querySelectorAll('[data-slot="card-list-group-empty"]').length,
  }
}

try {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.mobile ? 3 : 1,
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
      })
      const page = await context.newPage()
      const label = `${viewport.width}px ${theme}`
      await page.goto(`${origin}/?theme=${theme}`)
      await page.waitForSelector('[data-slot="card-list-item"]')
      const m = await page.evaluate(measure)
      record(`${label}: no sideways scroll`, m.overflowX <= 0, `overflow ${m.overflowX}px`)
      record(`${label}: cards inside the viewport`, m.outside === 0 && m.cardCount === 6, `${m.cardCount} cards`)
      record(`${label}: cards at least 44px tall`, m.shortest >= 44, `shortest ${m.shortest}px`)
      record(`${label}: long title and branch are cut`, m.titleCut && m.branchCut, `title ${m.titleCut}, branch ${m.branchCut}`)
      record(`${label}: active card is raised`, m.activeShadow !== "none", m.activeShadow.slice(0, 40))
      record(`${label}: empty group says so`, m.emptyGroups === 1)
      await page.screenshot({ path: path.join(assets, `card-list-${viewport.width}-${theme}.png`), fullPage: true })
      await context.close()
    }
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.mobile ? 3 : 1,
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
    })
    const page = await context.newPage()
    await page.goto(`${origin}/?view=before`)
    await page.waitForSelector("li")
    await page.screenshot({ path: path.join(assets, `card-list-before-${viewport.width}-light.png`), fullPage: true })
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
console.log("card-list: all checks passed")
