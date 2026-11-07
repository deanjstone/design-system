#!/usr/bin/env node
// Render, touch and URL-state proof for design-system#193: builds the filter-builder demo, serves it for
// the length of the run and opens it in ONE headless page at a time, at 390x844, 320x844, 768x900 and
// 1280x800, light and dark. The demo seeds its filters from the URL:
//   ?filter=label:is-not:bug;wave:is-any-of:w1,w2  ->  4 of 8 issues
// Checks, per view (WebKit):
//   - the page does not scroll sideways (documentElement.scrollWidth <= innerWidth)
//   - the seeded URL is read: the right issues show, and each filter is a row or a chip
//   - below 768px the rows are in a bottom sheet: none on the page until it opens; the sheet is flush with
//     the bottom edge, as wide as the screen, and does not scroll sideways; its Done button clears the
//     bottom safe area; at 768px and up the rows sit in the page
//   - a tap picks a checklist value, and the URL, the count and the results follow
//   - a chip removes its filter; the URL follows
//   - a reload, and a second page opened on the copied URL, show the same filters (shareable)
//   - under a coarse pointer, selects and inputs are 44px tall with 16px text, and the remove button,
//     chips and checklist rows are 44px
// Writes docs/assets/filter-builder-<width>-<theme>.png and filter-builder-<width>-sheet-light.png (the
// sheet open). Exits non-zero if a check fails.
//
// WebKit headless does not report `pointer: coarse` for an emulated phone, so the 44px checks run in a
// Chromium page (hasTouch + isMobile, which does) at 390px; WebKit reports the pointer it sees.
//
//   node docs/filter-builder/screenshots.mjs
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, webkit } from "playwright-core"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const assets = path.join(repo, "docs/assets")
const dist = path.join(os.tmpdir(), `filter-builder-demo-${process.pid}`)

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, FILTER_BUILDER_OUT: dist },
})
if (build.status !== 0) throw new Error("filter-builder demo build failed")

const VIEWPORTS = [
  { width: 390, height: 844, mobile: true },
  { width: 320, height: 844, mobile: true },
  { width: 768, height: 900, mobile: true },
  { width: 1280, height: 800, mobile: false },
]
const THEMES = ["light", "dark"]
const SEED = "label:is-not:bug;wave:is-any-of:w1,w2"

const { server, origin } = await serve(dist)
const webkitBrowser = await webkit.launch()
let chromiumBrowser
let failures = 0
const record = (name, ok, detail = "") => {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

const url = (theme, filter = SEED) => `${origin}/?theme=${theme}&filter=${encodeURIComponent(filter)}`
const filterParam = (page) => page.evaluate(() => new URLSearchParams(location.search).get("filter"))
const count = (page) => page.getByTestId("count").textContent()

const openContext = (browser, viewport) =>
  browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.mobile ? 3 : 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  })

const tap = (_page, locator, mobile) => (mobile ? locator.tap() : locator.click())
const rowsOf = (scope) => scope.locator('[data-slot="filter-builder-row"]')

// Sizes of the sheet's controls, read in the page.
const measureSheet = () => {
  const dialog = document.querySelector('[role="dialog"]')
  const box = dialog.getBoundingClientRect()
  const size = (el) => {
    const rect = el.getBoundingClientRect()
    return { width: rect.width, height: rect.height, font: parseFloat(getComputedStyle(el).fontSize) }
  }
  return {
    dialog: { left: box.left, right: box.right, bottom: box.bottom, width: box.width },
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    sideways: dialog.scrollWidth - dialog.clientWidth,
    selects: [...dialog.querySelectorAll("select")].map(size),
    inputs: [...dialog.querySelectorAll("input:not([type=checkbox]):not([aria-hidden])")].map(size),
    removes: [...dialog.querySelectorAll('button[aria-label^="Remove filter"]')].map(size),
    checklistRows: [...dialog.querySelectorAll("fieldset label")].map(size),
    done: size([...dialog.querySelectorAll("button")].find((el) => el.textContent.trim() === "Done")),
    coarse: window.matchMedia("(pointer: coarse)").matches,
  }
}

try {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await openContext(webkitBrowser, viewport)
      const page = await context.newPage()
      const label = `${viewport.width}px ${theme}`
      await page.goto(url(theme))
      await page.waitForSelector('[data-slot="filter-builder"]')

      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      record(`${label}: no sideways scroll`, sideways <= 0, `overflow ${sideways}px`)
      record(`${label}: the seeded URL is read`, (await count(page)) === "4 of 8", String(await count(page)))

      const sheetLayout = viewport.width < 768
      const layout = await page.locator('[data-slot="filter-builder"]').getAttribute("data-layout")
      record(`${label}: rows are ${sheetLayout ? "in a bottom sheet" : "in the page"}`, layout === (sheetLayout ? "sheet" : "inline"), `layout ${layout}`)

      if (sheetLayout) {
        record(`${label}: no rows on the page until the sheet opens`, (await rowsOf(page).count()) === 0)
        const chips = await page.getByRole("list", { name: "Active filters" }).getByRole("listitem").count()
        record(`${label}: both filters show as chips`, chips === 2, `${chips} chips`)
        await page.screenshot({ path: path.join(assets, `filter-builder-${viewport.width}-${theme}.png`), fullPage: true })

        if (theme === "light") {
          await tap(page, page.getByRole("button", { name: /^Filters/ }), true)
          await page.waitForSelector('[role="dialog"]')
          await page.waitForTimeout(700)
          const m = await page.evaluate(measureSheet)
          record(`${label}: the sheet is flush with the bottom and as wide as the screen`, Math.abs(m.dialog.bottom - m.innerHeight) < 1 && Math.abs(m.dialog.width - m.innerWidth) < 1, `bottom ${m.dialog.bottom}/${m.innerHeight}, width ${m.dialog.width}/${m.innerWidth}`)
          record(`${label}: the sheet does not scroll sideways`, m.sideways <= 0, `${m.sideways}px`)
          record(`${label}: two filter rows in the sheet`, (await rowsOf(page.getByRole("dialog")).count()) === 2)
          await page.screenshot({ path: path.join(assets, `filter-builder-${viewport.width}-sheet-light.png`) })

          // A tap on a checklist row picks the value; the URL, the count and the results follow.
          await tap(page, page.getByRole("checkbox", { name: "Later" }), true)
          await page.waitForTimeout(100)
          record(`${label}: a tap on a checklist row picks it`, (await filterParam(page)) === "label:is-not:bug;wave:is-any-of:w1,w2,later", String(await filterParam(page)))
          record(`${label}: the count follows`, (await count(page)) === "6 of 8", String(await count(page)))

          await tap(page, page.getByRole("button", { name: "Done" }), true)
          const closed = await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 3000 }).then(() => true, () => false)
          record(`${label}: Done closes the sheet`, closed)

          // A chip removes its filter.
          await tap(page, page.getByRole("list", { name: "Active filters" }).getByRole("button", { name: "Remove filter: Label is not Bug" }), true)
          await page.waitForTimeout(100)
          record(`${label}: a chip removes its filter and the URL follows`, (await filterParam(page)) === "wave:is-any-of:w1,w2,later" && (await count(page)) === "8 of 8", `${await filterParam(page)}, ${await count(page)}`)

          // Reload: the URL is the store.
          const kept = page.url()
          await page.reload()
          await page.waitForSelector('[data-slot="filter-builder"]')
          record(`${label}: a reload keeps the filters`, (await filterParam(page)) === "wave:is-any-of:w1,w2,later" && (await count(page)) === "8 of 8")

          // Share: a second page, opened on the copied URL, shows the same thing.
          const other = await (await openContext(webkitBrowser, viewport)).newPage()
          await other.goto(kept)
          await other.waitForSelector('[data-slot="filter-builder"]')
          record(`${label}: a second page opened on the copied URL shows the same filters`, (await filterParam(other)) === "wave:is-any-of:w1,w2,later" && (await count(other)) === "8 of 8")
          await other.context().close()
        }
      } else {
        const rowCount = await rowsOf(page).count()
        record(`${label}: two rows in the page`, rowCount === 2, `${rowCount} rows`)
        await page.screenshot({ path: path.join(assets, `filter-builder-${viewport.width}-${theme}.png`), fullPage: true })

        if (theme === "light") {
          const rows = rowsOf(page)
          // A native select changes the operator: label is not bug -> label is bug.
          await rows.nth(0).getByLabel("Operator").selectOption("is")
          await page.waitForTimeout(100)
          record(`${label}: a select changes the operator and the URL follows`, (await filterParam(page)) === "label:is:bug;wave:is-any-of:w1,w2" && (await count(page)) === "2 of 8", `${await filterParam(page)}, ${await count(page)}`)

          // The checklist behind a button picks several values.
          await rows.nth(1).getByRole("button", { name: /^Value:/ }).click()
          await page.getByRole("checkbox", { name: "Later" }).click()
          await page.waitForTimeout(100)
          record(`${label}: the checklist picks a value`, (await filterParam(page)) === "label:is:bug;wave:is-any-of:w1,w2,later", String(await filterParam(page)))
          await page.screenshot({ path: path.join(assets, `filter-builder-${viewport.width}-checklist-light.png`), fullPage: true })
          await page.keyboard.press("Escape")

          // Add a row, then Clear all.
          await page.getByRole("button", { name: "Add filter" }).click()
          record(`${label}: Add filter starts a row on the next field`, (await rowsOf(page).count()) === 3 && (await filterParam(page)).endsWith(";mode:has-any-of:"), String(await filterParam(page)))
          await page.getByRole("button", { name: "Clear all" }).click()
          record(`${label}: Clear all empties the list and the param`, (await filterParam(page)) === null && (await count(page)) === "8 of 8")
        }
      }
      await context.close()
    }
  }

  // Under a coarse pointer, in Chromium (hasTouch + isMobile reports `pointer: coarse`), at 390px.
  chromiumBrowser = await chromium.launch()
  const phone = { width: 390, height: 844, mobile: true }
  const context = await openContext(chromiumBrowser, phone)
  const page = await context.newPage()
  await page.goto(url("light", `${SEED};title:contains:row;points:gt:2`))
  await page.waitForSelector('[data-slot="filter-builder"]')
  await tap(page, page.getByRole("button", { name: /^Filters/ }), true)
  await page.waitForSelector('[role="dialog"]')
  await page.waitForTimeout(400)
  const m = await page.evaluate(measureSheet)
  record("coarse pointer: the page reports pointer: coarse", m.coarse)
  const floor = (list, key = "height") => list.length > 0 && list.every((entry) => entry[key] >= 43.5)
  record("coarse pointer: every select is 44px tall", floor(m.selects), m.selects.map((s) => Math.round(s.height)).join(","))
  record("coarse pointer: every select and input has 16px text, so iOS does not zoom", m.selects.concat(m.inputs).every((entry) => entry.font >= 16), m.selects.concat(m.inputs).map((s) => s.font).join(","))
  record("coarse pointer: every input is 44px tall", floor(m.inputs), m.inputs.map((s) => Math.round(s.height)).join(","))
  record("coarse pointer: every remove button is 44x44", floor(m.removes) && floor(m.removes, "width"), m.removes.map((s) => `${Math.round(s.width)}x${Math.round(s.height)}`).join(","))
  record("coarse pointer: every checklist row is 44px tall", floor(m.checklistRows), m.checklistRows.map((s) => Math.round(s.height)).join(","))
  record("coarse pointer: Done is 44px tall", m.done.height >= 43.5, String(Math.round(m.done.height)))
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
console.log("filter-builder: all checks passed")
