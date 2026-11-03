#!/usr/bin/env node
// Render proof for design-system#174: builds the layout demo, serves it for the length
// of the run, opens it in ONE headless Chromium tab and checks
//   - each of the seven items renders in the page (its section and data-slot are present)
//   - the page logs no console errors
//   - the accordion opens from the keyboard (Tab to its trigger, Enter)
//   - the pagination links are role=link, with the active page marked aria-current
// Writes a screenshot to docs/assets/layout-demo.png. Exits non-zero if a check fails.
//
//   node docs/layout/smoke-check.mjs
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const outFile = path.join(repo, "docs/assets/layout-demo.png")
const dist = path.join(os.tmpdir(), `layout-demo-${process.pid}`)

const headlessShell = fs.readdirSync(path.join(os.homedir(), ".cache/ms-playwright"))
  .filter((name) => name.startsWith("chromium_headless_shell-"))
  .sort()
  .map((name) => path.join(os.homedir(), ".cache/ms-playwright", name, "chrome-headless-shell-linux64/chrome-headless-shell"))
  .reverse()
  .find((candidate) => fs.existsSync(candidate))

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, LAYOUT_OUT: dist },
})
if (build.status !== 0) throw new Error("layout demo build failed")

const { server, origin } = await serve(dist)
const browser = await chromium.launch({ executablePath: headlessShell })
const results = []
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

try {
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } })
  const consoleErrors = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  await page.goto(origin)
  await page.waitForSelector("#accordion-heading")

  const items = [
    ["accordion", "#accordion-heading", '[data-slot="accordion-item"]'],
    ["alert", "#alert-heading", '[data-slot="alert"]'],
    ["aspect-ratio", "#aspect-heading", '[data-slot="aspect-ratio"]'],
    ["kbd", "#kbd-heading", '[data-slot="kbd"]'],
    ["resizable", "#resizable-heading", '[data-slot="resizable-panel-group"]'],
    ["carousel", "#carousel-heading", '[data-slot="carousel"]'],
    ["pagination", "#pagination-heading", '[data-slot="pagination-link"]'],
  ]
  for (const [name, heading, slot] of items) {
    const count = await page.locator(`section:has(${heading}) ${slot}`).count()
    record(`${name} renders`, count > 0, `${count} element(s)`)
  }

  const billing = page.getByRole("button", { name: "Billing" })
  await billing.focus()
  await page.keyboard.press("Enter")
  record("accordion opens from the keyboard", (await billing.getAttribute("aria-expanded")) === "true")

  const pageLinks = page.locator('[data-slot="pagination-link"]')
  const linkRoles = await pageLinks.evaluateAll((links) => links.map((link) => link.getAttribute("role")))
  record("pagination links are role=link", linkRoles.length > 0 && linkRoles.every((role) => role === "link"), linkRoles.join(","))
  record("active page is aria-current", (await page.getByRole("link", { name: "2", exact: true }).getAttribute("aria-current")) === "page")

  record("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "))

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  await page.screenshot({ path: outFile, fullPage: true })
  console.log(`screenshot ${outFile}`)
} finally {
  await browser.close()
  server.close()
}

const failed = results.filter((result) => !result.ok)
console.log(`smoke-check: ${results.length - failed.length}/${results.length} pass`)
if (failed.length) process.exit(1)
