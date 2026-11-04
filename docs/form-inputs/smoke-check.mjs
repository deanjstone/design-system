#!/usr/bin/env node
// Render proof for design-system#177: builds the form-inputs demo, serves it for the length
// of the run, opens it in ONE headless Chromium page and checks, at 320px wide in light and
// dark mode,
//   - each of the four items renders (its section and data-slot are present)
//   - the page logs no console errors and does not scroll sideways
//   - the combobox opens from its trigger and lists its options
// Writes docs/assets/form-inputs-320-light.png and form-inputs-320-dark.png.
// Exits non-zero if a check fails.
//
//   node docs/form-inputs/smoke-check.mjs
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const assets = path.join(repo, "docs/assets")
const dist = path.join(os.tmpdir(), `form-inputs-demo-${process.pid}`)

const headlessShell = fs.readdirSync(path.join(os.homedir(), ".cache/ms-playwright"))
  .filter((name) => name.startsWith("chromium_headless_shell-"))
  .sort()
  .map((name) => path.join(os.homedir(), ".cache/ms-playwright", name, "chrome-headless-shell-linux64/chrome-headless-shell"))
  .reverse()
  .find((candidate) => fs.existsSync(candidate))

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, FORM_INPUTS_OUT: dist },
})
if (build.status !== 0) throw new Error("form-inputs demo build failed")

const { server, origin } = await serve(dist)
const browser = await chromium.launch({ executablePath: headlessShell })
const results = []
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

const items = [
  ["radio-group", "#radio-heading", '[data-slot="radio-group-item"]'],
  ["native-select", "#native-select-heading", '[data-slot="native-select"]'],
  ["input-otp", "#otp-heading", '[data-slot="input-otp-slot"]'],
  ["combobox", "#combobox-heading", '[data-slot="input-group"]'],
]

try {
  const page = await browser.newPage({ viewport: { width: 320, height: 700 } })
  const consoleErrors = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  fs.mkdirSync(assets, { recursive: true })

  for (const theme of ["light", "dark"]) {
    await page.goto(`${origin}/?theme=${theme}`)
    await page.waitForSelector("#radio-heading")
    for (const [name, heading, slot] of items) {
      const count = await page.locator(`section:has(${heading}) ${slot}`).count()
      record(`${theme}: ${name} renders`, count > 0, `${count} element(s)`)
    }
    const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"))
    record(`${theme}: dark class matches`, dark === (theme === "dark"))
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    record(`${theme}: no sideways scroll at 320px`, overflow <= 0, `${overflow}px over`)

    await page.getByRole("combobox", { name: "Fruit" }).click()
    const optionVisible = await page.getByRole("option", { name: "Banana" }).waitFor({ state: "visible", timeout: 2000 }).then(() => true, () => false)
    record(`${theme}: combobox opens its list`, optionVisible)
    await page.keyboard.press("Escape")

    await page.screenshot({ path: path.join(assets, `form-inputs-320-${theme}.png`), fullPage: true })
    console.log(`screenshot docs/assets/form-inputs-320-${theme}.png`)
  }
  record("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "))
} finally {
  await browser.close()
  server.close()
}

const failed = results.filter((result) => !result.ok)
console.log(`smoke-check: ${results.length - failed.length}/${results.length} pass`)
if (failed.length) process.exit(1)
