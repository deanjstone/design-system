#!/usr/bin/env node
// Render and touch proof for design-system#192: builds the issue-row demo, serves it for the length of
// the run and opens it in ONE headless WebKit page at a time, at 390x844, 320x844, 768x900 and
// 1280x800, light and dark. Checks, per view:
//   - the page does not scroll sideways (documentElement.scrollWidth <= innerWidth)
//   - every row is 44px tall and sits inside the viewport
//   - the columns drop away by priority: below sm (640) only the priority, status and title show; at
//     sm the id, due date and assignee join; at lg (1024) the labels and the project join
//   - the long title is cut, and at 320px the title keeps at least 120px
//   - the more button is 44x44, and a hit test at its centre lands on it while a hit test over the
//     title area lands on the stretched title link (so a tap anywhere else opens the item)
//   - a tap (touch) or click on the title opens the item
//   - the more button opens the menu without opening the item; its items run their action
//   - a long-press (a touchstart held for 600ms) and, on desktop, a right-click open the same menu
// Writes docs/assets/issue-row-<width>-<theme>.png and issue-row-<width>-menu-light.png (the menu
// open). Exits non-zero if a check fails.
//
//   node docs/issue-row/screenshots.mjs
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { webkit } from "playwright-core"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const assets = path.join(repo, "docs/assets")
const dist = path.join(os.tmpdir(), `issue-row-demo-${process.pid}`)

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, ISSUE_ROW_OUT: dist },
})
if (build.status !== 0) throw new Error("issue-row demo build failed")

const VIEWPORTS = [
  { width: 390, height: 844, mobile: true },
  { width: 320, height: 844, mobile: true },
  { width: 768, height: 900, mobile: true },
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
  const rows = [...document.querySelectorAll('[data-slot="issue-row"]')]
  const first = rows[0]
  const shown = (row, slot) => {
    const el = row.querySelector(`[data-slot="issue-row-${slot}"]`)
    return el ? getComputedStyle(el).display !== "none" : false
  }
  const longTitle = [...document.querySelectorAll('[data-slot="issue-row-title"]')].find((el) => el.textContent.startsWith("Promote the ops-hub"))
  const more = first.querySelector('[data-slot="issue-row-more"]')
  const moreBox = more.getBoundingClientRect()
  const title = first.querySelector('[data-slot="issue-row-title"]')
  const titleBox = title.getBoundingClientRect()
  const rowBox = first.getBoundingClientRect()
  const probe = (x, y) => {
    const hit = document.elementFromPoint(x, y)
    return hit ? hit.closest("[data-slot]")?.getAttribute("data-slot") : null
  }
  const assignee = first.querySelector('[data-slot="issue-row-assignee"]')
  const assigneeBox = assignee ? assignee.getBoundingClientRect() : null
  const titleBoxOfLong = longTitle ? longTitle.getBoundingClientRect() : null
  return {
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    rowCount: rows.length,
    heights: rows.map((row) => row.getBoundingClientRect().height),
    outside: rows.filter((row) => {
      const box = row.getBoundingClientRect()
      return box.left < 0 || box.right > window.innerWidth
    }).length,
    columns: Object.fromEntries(["priority", "identifier", "status", "labels", "project", "due-date", "assignee"].map((slot) => [slot, shown(first, slot)])),
    titleCut: longTitle ? longTitle.scrollWidth > longTitle.clientWidth : false,
    longTitleWidth: titleBoxOfLong ? titleBoxOfLong.width : 0,
    moreSize: [moreBox.width, moreBox.height],
    moreHit: probe(moreBox.left + moreBox.width / 2, moreBox.top + moreBox.height / 2),
    titleHit: probe(titleBox.left + Math.min(titleBox.width / 2, 60), rowBox.top + rowBox.height / 2),
    assigneeHit: assigneeBox && assigneeBox.width > 0 ? probe(assigneeBox.left + assigneeBox.width / 2, assigneeBox.top + assigneeBox.height / 2) : "n/a",
    coarse: window.matchMedia("(pointer: coarse)").matches,
  }
}

// A real long-press needs a finger held down, and Playwright has no touch-hold API. The script
// dispatches the touchstart a finger would and holds it for 650ms (Base UI's delay is 500ms). WebKit
// here cannot construct a Touch, so the event is a plain Event with the `touches` a finger gives.
const longPress = async (page, selector) => {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const box = el.getBoundingClientRect()
    const touch = { identifier: 1, target: el, clientX: box.left + 40, clientY: box.top + box.height / 2 }
    const event = new Event("touchstart", { bubbles: true, cancelable: true })
    for (const key of ["touches", "targetTouches", "changedTouches"]) Object.defineProperty(event, key, { value: [touch] })
    el.dispatchEvent(event)
  }, selector)
  await page.waitForTimeout(650)
}

const openContext = (viewport) =>
  browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.mobile ? 3 : 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  })

try {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await openContext(viewport)
      const page = await context.newPage()
      const label = `${viewport.width}px ${theme}`
      await page.goto(`${origin}/?theme=${theme}`)
      await page.waitForSelector('[data-slot="issue-row"]')
      const m = await page.evaluate(measure)
      record(`${label}: no sideways scroll`, m.overflowX <= 0, `overflow ${m.overflowX}px`)
      record(`${label}: five rows inside the viewport`, m.rowCount === 5 && m.outside === 0, `${m.rowCount} rows`)
      record(`${label}: rows are 44px`, m.heights.every((h) => Math.abs(h - 44) < 0.6), m.heights.map((h) => Math.round(h * 10) / 10).join(","))
      const sm = viewport.width >= 640
      const lg = viewport.width >= 1024
      const expected = { priority: true, status: true, identifier: sm, "due-date": sm, assignee: sm, labels: lg, project: lg }
      const wrong = Object.entries(expected).filter(([slot, want]) => m.columns[slot] !== want).map(([slot]) => slot)
      record(`${label}: columns ${lg ? "all show" : sm ? "stop short of labels and project" : "are priority, status, title"}`, wrong.length === 0, wrong.length ? `wrong: ${wrong.join(",")}` : "")
      record(`${label}: long title is cut and keeps room`, m.titleCut && m.longTitleWidth >= 120, `cut ${m.titleCut}, ${Math.round(m.longTitleWidth)}px wide`)
      record(`${label}: more button is 44x44`, Math.abs(m.moreSize[0] - 44) < 0.6 && Math.abs(m.moreSize[1] - 44) < 0.6, m.moreSize.join("x"))
      record(`${label}: a hit on the more button lands on it`, m.moreHit === "issue-row-more", String(m.moreHit))
      record(`${label}: a hit over the title area lands on the title link`, m.titleHit === "issue-row-title", String(m.titleHit))
      if (sm) record(`${label}: a hit on the assignee lands on the title link (a tap there opens the item)`, m.assigneeHit === "issue-row-title", String(m.assigneeHit))
      await page.screenshot({ path: path.join(assets, `issue-row-${viewport.width}-${theme}.png`), fullPage: true })

      if (theme === "light") {
        const row = '[data-slot="issue-row"]'
        const box = await page.locator(`${row} >> nth=0`).locator('[data-slot="issue-row-title"]').boundingBox()
        const tapX = box.x + Math.min(box.width / 2, 60)
        const tapY = box.y + box.height / 2

        // Tap or click the title: the item opens.
        if (viewport.mobile) await page.touchscreen.tap(tapX, tapY)
        else await page.mouse.click(tapX, tapY)
        await page.waitForTimeout(100)
        record(`${label}: ${viewport.mobile ? "tap" : "click"} on the title opens the item`, (await page.evaluate(() => location.hash)) === "#issue-192")
        await page.evaluate(() => history.replaceState(null, "", location.pathname + location.search))

        // The more button: opens the menu, does not open the item.
        const more = page.locator('[data-slot="issue-row-more"]').first()
        const moreBox = await more.boundingBox()
        if (viewport.mobile) await page.touchscreen.tap(moreBox.x + 22, moreBox.y + 22)
        else await more.click()
        await page.waitForSelector('[role="menu"]')
        const itemHeights = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.getBoundingClientRect().height))
        const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)
        record(`${label}: more button opens the menu and not the item`, itemHeights.length === 3 && (await page.evaluate(() => location.hash)) === "", `${itemHeights.length} items`)
        record(
          `${label}: menu items are 44px under a coarse pointer`,
          coarse ? itemHeights.every((h) => h >= 44) : true,
          coarse ? itemHeights.map((h) => Math.round(h)).join(",") : `pointer is not coarse here; ${itemHeights.map((h) => Math.round(h)).join(",")}px`,
        )
        await page.screenshot({ path: path.join(assets, `issue-row-${viewport.width}-menu-light.png`), fullPage: true })
        const item = page.getByRole("menuitem", { name: "Assign to me" })
        const itemBox = await item.boundingBox()
        if (viewport.mobile) await page.touchscreen.tap(itemBox.x + 20, itemBox.y + itemBox.height / 2)
        else await item.click()
        await page.waitForTimeout(150)
        const logged = await page.getByTestId("log").textContent()
        record(`${label}: a menu action runs and closes the menu`, logged === "DS-192: assign" && (await page.locator('[role="menu"]').count()) === 0, String(logged))

        if (viewport.mobile) {
          // Long-press: a finger held on the row opens the same menu.
          await longPress(page, '[data-slot="issue-row-title"]')
          record(`${label}: a long-press opens the menu`, (await page.locator('[role="menu"]').count()) === 1)
          await page.keyboard.press("Escape")
        } else {
          await page.mouse.click(tapX, tapY, { button: "right" })
          await page.waitForSelector('[role="menu"]')
          record(`${label}: a right-click opens the menu`, true)
          await page.keyboard.press("Escape")
        }
      }
      await context.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log("issue-row: all checks passed")
