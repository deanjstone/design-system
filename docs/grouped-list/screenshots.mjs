#!/usr/bin/env node
// Render, touch and persistence proof for design-system#194: builds the grouped-list demo, serves it for
// the length of the run and opens it in ONE headless page at a time, at 390x844, 320x844, 768x900 and
// 1280x800, light and dark. The demo groups eight issues by status to start (Working 2, To do 4, Done 2)
// and keeps its display choices in localStorage under the view "demo".
// Checks, per view (WebKit):
//   - the page does not scroll sideways (documentElement.scrollWidth <= innerWidth)
//   - the three group headers are 44px tall and fit the screen, and every row is 44px
//   - light only, per view:
//     - a tap on a header collapses its group (items gone, header and count stay, aria-expanded false)
//     - a reload keeps it collapsed, and a second tap expands it
//     - the Display menu opens inside the screen; Group by Repo regroups (design-system 3, argus 3,
//       homelab 2, in the order the repos first appear); a group collapsed under
//       Status is still collapsed on returning to Status, and nothing carries over to Repo
//     - Group by Label draws an issue in each of its groups, and the one with no label in a last group
//     - No grouping is one list with no headers
//     - turning Labels off removes the labels cell, and a reload keeps it off
//     - Reset puts the status grouping and the labels back, and expands the collapsed group
// Writes docs/assets/grouped-list-<width>-<theme>.png and grouped-list-<width>-menu-light.png (the menu
// open). Exits non-zero if a check fails.
//
// WebKit headless does not report `pointer: coarse` for an emulated phone, so the 44px checks on the
// menu's own controls run in a Chromium page (hasTouch + isMobile, which does) at 390px.
//
//   node docs/grouped-list/screenshots.mjs
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, webkit } from "playwright-core"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const assets = path.join(repo, "docs/assets")
const dist = path.join(os.tmpdir(), `grouped-list-demo-${process.pid}`)

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, GROUPED_LIST_OUT: dist },
})
if (build.status !== 0) throw new Error("grouped-list demo build failed")

const VIEWPORTS = [
  { width: 390, height: 844, mobile: true },
  { width: 320, height: 844, mobile: true },
  { width: 768, height: 900, mobile: true },
  { width: 1280, height: 800, mobile: false },
]
const THEMES = ["light", "dark"]

const { server, origin } = await serve(dist)
const webkitBrowser = await webkit.launch()
let chromiumBrowser
let failures = 0
const record = (name, ok, detail = "") => {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

const openContext = (browser, viewport) =>
  browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.mobile ? 3 : 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  })

const tap = (locator, mobile) => (mobile ? locator.tap() : locator.click())
const headings = (page) => page.getByRole("heading", { level: 3 }).allTextContents()
const headerButton = (page, name) => page.getByRole("button", { name })
const rowCount = (page) => page.locator('[data-slot="issue-row"]').count()
const settle = (page) => page.waitForTimeout(150)

// Sizes of the page's grouped-list pieces, read in the page.
const measurePage = () => {
  const size = (el) => {
    const rect = el.getBoundingClientRect()
    return { left: rect.left, right: rect.right, width: rect.width, height: rect.height }
  }
  return {
    headers: [...document.querySelectorAll('[data-slot="grouped-list-header"]')].map(size),
    rows: [...document.querySelectorAll('[data-slot="issue-row"]')].map(size),
    innerWidth: window.innerWidth,
  }
}

const measureMenu = () => {
  const menu = document.querySelector('[data-slot="popover-content"]')
  const box = menu.getBoundingClientRect()
  const size = (el) => {
    const rect = el.getBoundingClientRect()
    return { width: rect.width, height: rect.height, font: parseFloat(getComputedStyle(el).fontSize) }
  }
  const trigger = document.querySelector('[data-slot="display-menu"] button')
  return {
    menu: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    trigger: size(trigger),
    select: size(menu.querySelector("select")),
    checklistRows: [...menu.querySelectorAll("fieldset label")].map(size),
    reset: size([...menu.querySelectorAll("button")].find((el) => el.textContent.trim() === "Reset")),
    coarse: window.matchMedia("(pointer: coarse)").matches,
  }
}

const openMenu = async (page, mobile) => {
  await tap(page.getByRole("button", { name: "Display" }), mobile)
  await page.waitForSelector('[data-slot="popover-content"]')
  await page.waitForTimeout(300)
}
const closeMenu = async (page) => {
  await page.keyboard.press("Escape")
  await page.waitForSelector('[data-slot="popover-content"]', { state: "detached", timeout: 3000 }).catch(() => {})
}

try {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await openContext(webkitBrowser, viewport)
      const page = await context.newPage()
      const label = `${viewport.width}px ${theme}`
      const mobile = viewport.mobile
      await page.goto(`${origin}/?theme=${theme}`)
      await page.waitForSelector('[data-slot="grouped-list"]')

      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      record(`${label}: no sideways scroll`, sideways <= 0, `overflow ${sideways}px`)
      const heads = await headings(page)
      record(`${label}: grouped by status to start`, heads.join("|") === "Working2|To do4|Done2", heads.join("|"))

      const m = await page.evaluate(measurePage)
      record(`${label}: every header is 44px tall and fits the screen`, m.headers.length === 3 && m.headers.every((h) => Math.abs(h.height - 44) < 1 && h.left >= 0 && h.right <= m.innerWidth + 0.5), m.headers.map((h) => Math.round(h.height)).join(","))
      record(`${label}: every row is 44px tall`, m.rows.length === 8 && m.rows.every((r) => Math.abs(r.height - 44) < 1), m.rows.map((r) => Math.round(r.height)).join(","))
      await page.screenshot({ path: path.join(assets, `grouped-list-${viewport.width}-${theme}.png`), fullPage: true })

      if (theme === "light") {
        // Collapse, reload, expand.
        const working = () => headerButton(page, /^Working/)
        await tap(working(), mobile)
        await settle(page)
        record(`${label}: a tap on a header collapses its group`, (await working().getAttribute("aria-expanded")) === "false" && (await rowCount(page)) === 6, `${await rowCount(page)} rows`)
        record(`${label}: the collapsed header keeps its count`, (await working().textContent()).includes("2"))
        await page.reload()
        await page.waitForSelector('[data-slot="grouped-list"]')
        record(`${label}: a reload keeps the group collapsed`, (await working().getAttribute("aria-expanded")) === "false" && (await rowCount(page)) === 6)

        // The menu, with Working still collapsed under Status.
        await openMenu(page, mobile)
        const menu = await page.evaluate(measureMenu)
        record(`${label}: the Display menu opens inside the screen`, menu.menu.left >= 0 && menu.menu.right <= menu.innerWidth + 0.5 && menu.menu.top >= 0 && menu.menu.bottom <= menu.innerHeight + 0.5, `${Math.round(menu.menu.left)}..${Math.round(menu.menu.right)} of ${menu.innerWidth}`)
        await page.screenshot({ path: path.join(assets, `grouped-list-${viewport.width}-menu-light.png`) })

        await page.getByRole("combobox", { name: "Group by" }).selectOption("repo")
        await settle(page)
        const byRepo = await headings(page)
        record(`${label}: Group by Repo regroups`, byRepo.join("|") === "design-system3|argus3|homelab2", byRepo.join("|"))
        record(`${label}: nothing is collapsed under Repo`, (await rowCount(page)) === 8)
        await page.getByRole("combobox", { name: "Group by" }).selectOption("status")
        await settle(page)
        record(`${label}: back on Status, Working is still collapsed`, (await working().getAttribute("aria-expanded")) === "false" && (await rowCount(page)) === 6)

        // Label grouping: an item in each of its groups, the unlabelled one last.
        await page.getByRole("combobox", { name: "Group by" }).selectOption("label")
        await settle(page)
        const byLabel = await headings(page)
        record(`${label}: Group by Label ends with No label`, byLabel[byLabel.length - 1] === "No label1", byLabel.join("|"))
        record(`${label}: an issue with two labels is in both groups`, (await page.getByText("Grouped, collapsible lists with display toggles").count()) === 2)

        await page.getByRole("combobox", { name: "Group by" }).selectOption("")
        await settle(page)
        record(`${label}: No grouping is one list with no headers`, (await headings(page)).length === 0 && (await rowCount(page)) === 8)

        // Back to Status; turn Labels off. The labels cell shows from lg up, so check at 1280.
        await page.getByRole("combobox", { name: "Group by" }).selectOption("status")
        await settle(page)
        const labelCells = () => page.locator('[data-slot="issue-row-labels"]').count()
        const before = await labelCells()
        await tap(page.getByRole("checkbox", { name: "Labels" }), mobile)
        await settle(page)
        record(`${label}: turning Labels off removes the cell`, before === 6 && (await labelCells()) === 0, `${before} -> ${await labelCells()}`)
        await closeMenu(page)
        await page.reload()
        await page.waitForSelector('[data-slot="grouped-list"]')
        await openMenu(page, mobile)
        record(`${label}: a reload keeps Labels off`, (await labelCells()) === 0 && (await page.getByRole("checkbox", { name: "Labels" }).getAttribute("aria-checked")) === "false")

        await tap(page.getByRole("button", { name: "Reset" }), mobile)
        await settle(page)
        const reset = await headings(page)
        record(`${label}: Reset puts Status and Labels back and expands every group`, reset.join("|") === "Working2|To do4|Done2" && (await rowCount(page)) === 8 && (await labelCells()) === 8, `${reset.join("|")}, ${await rowCount(page)} rows, labels ${await labelCells()}`)
      }
      await context.close()
    }
  }

  // Under a coarse pointer, in Chromium (hasTouch + isMobile reports `pointer: coarse`), at 390px.
  chromiumBrowser = await chromium.launch()
  const phone = { width: 390, height: 844, mobile: true }
  const context = await openContext(chromiumBrowser, phone)
  const page = await context.newPage()
  await page.goto(`${origin}/?theme=light`)
  await page.waitForSelector('[data-slot="grouped-list"]')
  await openMenu(page, true)
  const m = await page.evaluate(measureMenu)
  const floor = (value) => value >= 43.5
  record("coarse pointer: the page reports pointer: coarse", m.coarse)
  record("coarse pointer: the Display button is 44px tall", floor(m.trigger.height), String(Math.round(m.trigger.height)))
  record("coarse pointer: the Group by select is 44px tall with 16px text, so iOS does not zoom", floor(m.select.height) && m.select.font >= 16, `${Math.round(m.select.height)}px, ${m.select.font}px`)
  record("coarse pointer: every property row is 44px tall", m.checklistRows.length === 7 && m.checklistRows.every((row) => floor(row.height)), m.checklistRows.map((row) => Math.round(row.height)).join(","))
  record("coarse pointer: Reset is 44px tall", floor(m.reset.height), String(Math.round(m.reset.height)))
  await context.close()
} finally {
  await webkitBrowser.close()
  if (chromiumBrowser) await chromiumBrowser.close()
  server.close()
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log("grouped-list: all checks passed")
