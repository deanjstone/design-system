#!/usr/bin/env node
// Keyboard proof for design-system#173: builds the menus demo, serves it for the length
// of the run, drives it with real key presses in ONE headless Chromium tab and reports
//   - menubar: Tab reaches it, ArrowRight moves between menus, Enter opens, ArrowDown
//     moves into the list, Escape closes
//   - context menu: the context-menu key opens it, ArrowDown moves into the list, Escape closes
//   - navigation menu: Tab reaches a trigger, Enter opens its panel, Tab reaches its link
//   - hover card: focusing its trigger opens the card (reported, not asserted)
// Exits non-zero if any asserted check fails.
//
//   node docs/menus/keyboard-check.mjs [--out docs/assets/menus-demo.png]
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const args = process.argv.slice(2)
const outFile = path.resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(repo, "docs/assets/menus-demo.png"))
const dist = path.join(os.tmpdir(), `menus-demo-${process.pid}`)

const headlessShell = fs.readdirSync(path.join(os.homedir(), ".cache/ms-playwright"))
  .filter((name) => name.startsWith("chromium_headless_shell-"))
  .sort()
  .map((name) => path.join(os.homedir(), ".cache/ms-playwright", name, "chrome-headless-shell-linux64/chrome-headless-shell"))
  .reverse()
  .find((candidate) => fs.existsSync(candidate))

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, MENUS_OUT: dist },
})
if (build.status !== 0) throw new Error("menus demo build failed")

const { server, origin } = await serve(dist)
const browser = await chromium.launch({ executablePath: headlessShell })
const results = []
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

try {
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } })
  await page.goto(origin)
  await page.waitForSelector('[role="menubar"]')

  const activeText = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? "")
  const tabUntil = async (text) => {
    for (let step = 0; step < 40; step++) {
      await page.keyboard.press("Tab")
      if ((await activeText()).startsWith(text)) return true
    }
    return false
  }
  const becomesHidden = (locator) =>
    locator.first().waitFor({ state: "hidden", timeout: 2000 }).then(() => true, () => false)

  // Menubar
  const reachedFile = await tabUntil("File")
  record("menubar: Tab reaches File", reachedFile, await activeText())
  await page.keyboard.press("ArrowRight")
  record("menubar: ArrowRight moves to Edit", (await activeText()) === "Edit", await activeText())
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("Enter")
  await page.waitForSelector('[role="menu"]', { timeout: 2000 }).catch(() => null)
  const fileOpen = await page.locator('[role="menu"]').first().isVisible().catch(() => false)
  record("menubar: Enter opens File", fileOpen)
  record("menubar: opening focuses the first item", (await activeText()) === "New tab", await activeText())
  await page.keyboard.press("ArrowDown")
  record("menubar: ArrowDown moves to the next item", (await activeText()) === "Open", await activeText())
  await page.keyboard.press("Escape")
  const fileClosed = await becomesHidden(page.locator('[role="menu"]'))
  record("menubar: Escape closes File", fileClosed)

  // Context menu
  const reachedArea = await tabUntil("Right-click")
  record("context menu: Tab reaches the area", reachedArea, await activeText())
  await page.keyboard.press("Shift+F10")
  await page.waitForSelector('[role="menu"]', { timeout: 2000 }).catch(() => null)
  const contextOpen = await page.locator('[role="menu"]').first().isVisible().catch(() => false)
  record("context menu: Shift+F10 opens it", contextOpen)
  await page.keyboard.press("ArrowDown")
  record("context menu: ArrowDown moves into the list", (await activeText()) === "Copy", await activeText())
  await page.keyboard.press("Escape")
  const contextClosed = await becomesHidden(page.locator('[role="menu"]'))
  record("context menu: Escape closes it", contextClosed)

  // Navigation menu
  const reachedProducts = await tabUntil("Products")
  record("navigation menu: Tab reaches Products", reachedProducts, await activeText())
  await page.keyboard.press("Enter")
  const argusVisible = await page.getByRole("link", { name: "Argus" }).isVisible().catch(() => false)
  record("navigation menu: Enter opens the panel", argusVisible)
  await page.keyboard.press("Tab")
  record("navigation menu: Tab reaches Argus", (await activeText()) === "Argus", await activeText())

  // Hover card (reported only: focus behaviour is Base UI's, not asserted here)
  await tabUntil("@design-system")
  await page.waitForTimeout(1200)
  const hoverOpen = await page.getByText("Shared registry for the homelab apps.").isVisible().catch(() => false)
  console.log(`INFO hover card opens on keyboard focus: ${hoverOpen}`)

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  await page.screenshot({ path: outFile, fullPage: true })
  console.log(`screenshot ${outFile}`)
} finally {
  await browser.close()
  server.close()
}

const failed = results.filter((result) => !result.ok)
console.log(`keyboard-check: ${results.length - failed.length}/${results.length} pass`)
if (failed.length) process.exit(1)
