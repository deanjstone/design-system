#!/usr/bin/env node
// Render proof and bundle cost for design-system#175: builds the data demo, serves it for
// the length of the run, opens it in ONE headless Chromium tab and checks
//   - the chart (recharts, lazy-loaded) renders in a light and a dark panel
//   - its bars take their fill from --chart-1 / --chart-2 in each panel, so the colours
//     are theme tokens and differ between the modes
//   - the first bundle carries neither recharts nor chart.tsx; recharts arrives as its own chunk
//   - the data table sorts, filters and pages from the keyboard-reachable controls
//   - the page logs no console errors
// It prints the gzip size of the first bundle, the react-table chunk and the recharts chunk
// (the bundle cost), and writes a screenshot to docs/assets/data-demo.png. Exits non-zero if
// a check fails.
//
//   node docs/data/smoke-check.mjs
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"
import { chromium } from "playwright-core"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const outFile = path.join(repo, "docs/assets/data-demo.png")
const dist = path.join(os.tmpdir(), `data-demo-${process.pid}`)

const headlessShell = fs.readdirSync(path.join(os.homedir(), ".cache/ms-playwright"))
  .filter((name) => name.startsWith("chromium_headless_shell-"))
  .sort()
  .map((name) => path.join(os.homedir(), ".cache/ms-playwright", name, "chrome-headless-shell-linux64/chrome-headless-shell"))
  .reverse()
  .find((candidate) => fs.existsSync(candidate))

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, DATA_OUT: dist },
})
if (build.status !== 0) throw new Error("data demo build failed")

const results = []
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

// Bundle cost: every emitted script, by what it holds.
const assets = fs.readdirSync(path.join(dist, "assets")).filter((file) => file.endsWith(".js"))
const chunks = assets.map((file) => {
  const code = fs.readFileSync(path.join(dist, "assets", file))
  return { file, text: code.toString("utf8"), raw: code.length, gzip: gzipSync(code).length }
})
const indexHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8")
const entry = chunks.find((chunk) => indexHtml.includes(chunk.file))
const rechartsChunk = chunks.find((chunk) => chunk.text.includes("recharts-wrapper"))
const tableChunk = chunks.find((chunk) => chunk.file.startsWith("react-table"))
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`
for (const [label, chunk] of [["first bundle", entry], ["react-table chunk", tableChunk], ["recharts chunk (lazy)", rechartsChunk]]) {
  console.log(`bundle ${label}: ${chunk ? `${chunk.file} ${kb(chunk.raw)} raw, ${kb(chunk.gzip)} gzip` : "missing"}`)
}
record("recharts is its own chunk, apart from the first bundle", Boolean(entry && rechartsChunk && entry.file !== rechartsChunk.file))
record("the first bundle holds no recharts code", Boolean(entry) && !entry.text.includes("recharts-wrapper") && !entry.text.includes("recharts-surface"))
record("the first bundle does not statically import the recharts chunk", Boolean(entry && rechartsChunk) && !new RegExp(`import[^;]*${rechartsChunk.file}`).test(entry.text.replace(/import\(/g, "")))

const { server, origin } = await serve(dist)
const browser = await chromium.launch({ executablePath: headlessShell })

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const consoleErrors = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  const requested = []
  page.on("request", (request) => requested.push(new URL(request.url()).pathname))
  await page.goto(origin)
  await page.waitForSelector(".panel[data-mode='dark'] .recharts-bar-rectangle path")
  await page.waitForSelector(".panel[data-mode='light'] .recharts-bar-rectangle path")

  record("the recharts chunk is requested by the page", Boolean(rechartsChunk) && requested.some((url) => url.endsWith(rechartsChunk.file)))

  const resolved = (mode, token) =>
    page.locator(`.panel[data-mode='${mode}']`).evaluate((panel, name) => {
      const probe = document.createElement("span")
      probe.style.color = `var(${name})`
      panel.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    }, token)
  const barFills = (mode) =>
    page.locator(`.panel[data-mode='${mode}'] .recharts-bar-rectangle path`).evaluateAll((paths) => paths.map((path) => getComputedStyle(path).fill))

  const fills = {}
  for (const mode of ["light", "dark"]) {
    const allowed = [await resolved(mode, "--chart-1"), await resolved(mode, "--chart-2")]
    const found = await barFills(mode)
    fills[mode] = allowed
    record(`${mode} bars are filled only with --chart-1 and --chart-2`, found.length === 8 && found.every((fill) => allowed.includes(fill)), `${found.length} bars, ${[...new Set(found)].join(" ")}`)
  }
  record("the chart colours differ between light and dark", fills.light[0] !== fills.dark[0] && fills.light[1] !== fills.dark[1], `${fills.light[0]} vs ${fills.dark[0]}`)

  const light = page.locator(".panel[data-mode='light']")
  const customers = () =>
    light.locator('[data-slot="table-body"] tr').evaluateAll((rows) => rows.map((row) => row.querySelector("td")?.textContent))
  record("the table starts on page 1 of 2", (await light.getByText("Page 1 of 2").count()) === 1)

  await light.getByRole("button", { name: "Customer" }).click()
  record("sorting by customer ascending puts Amy first", (await customers())[0] === "Amy", (await customers()).join(","))
  record("the sorted column is marked aria-sort=ascending", (await light.getByRole("columnheader", { name: /Customer/ }).getAttribute("aria-sort")) === "ascending")

  await light.getByRole("button", { name: "Next" }).click()
  record("Next shows page 2", (await light.getByText("Page 2 of 2").count()) === 1, (await customers()).join(","))

  await light.getByRole("textbox", { name: "Filter customers" }).fill("bo")
  record("the filter narrows to Bob", (await customers()).join(",") === "Bob", (await customers()).join(","))

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
