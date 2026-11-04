#!/usr/bin/env node
// Rendered proof for design-system#183: builds the graph-3d demo, serves it for the length
// of the run, opens it in ONE headless Chromium tab at ?tone=void and reports
//   - draw calls per rendered frame, counted by wrapping drawArrays/drawElements, at rest,
//     while a node is hovered and while zoomed in (the number must not rise with labels or edges)
//   - the DOM labels on screen in each state: how many, and which roles
// then writes a screenshot per state and closes everything. Works on a tree from before the
// labels existed (it then finds the hovered node by its tooltip and counts no labels), which is
// how the "before" screenshots were taken.
//
//   node docs/graph-3d/inspect.mjs [--nodes 1300] [--out docs/assets] [--prefix graph-3d-edges-labels-after]
//
// Software WebGL (SwiftShader), like measure.mjs: the draw-call counts are exact, the frame rates are not.
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
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const nodeCount = Number(option("--nodes", 1300))
const outDir = path.resolve(option("--out", path.join(repo, "docs/assets")))
const prefix = option("--prefix", "graph-3d-edges-labels-after")
const dist = path.join(os.tmpdir(), `graph-3d-inspect-${process.pid}`)

const headlessShell = fs.readdirSync(path.join(os.homedir(), ".cache/ms-playwright"))
  .filter((name) => name.startsWith("chromium_headless_shell-"))
  .sort()
  .map((name) => path.join(os.homedir(), ".cache/ms-playwright", name, "chrome-headless-shell-linux64/chrome-headless-shell"))
  .reverse()
  .find((candidate) => fs.existsSync(candidate))

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, GRAPH3D_OUT: dist },
})
if (build.status !== 0) throw new Error("demo build failed")

// Counts every draw call, and records the count at each animation frame. A frame that drew
// nothing (the renderer sleeps when nothing moves) shows as a zero and is not sampled.
const drawCounter = () => {
  window.__draws = 0
  window.__perFrame = []
  for (const name of ["WebGLRenderingContext", "WebGL2RenderingContext"]) {
    const proto = window[name]?.prototype
    if (!proto) continue
    for (const method of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const original = proto[method]
      if (!original) continue
      proto[method] = function (...callArgs) {
        window.__draws++
        return original.apply(this, callArgs)
      }
    }
  }
  let last = 0
  const tick = () => {
    window.__perFrame.push(window.__draws - last)
    last = window.__draws
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const sampleDraws = async (page, ms) => {
  await page.evaluate(() => { window.__perFrame = [] })
  await page.waitForTimeout(ms)
  const frames = (await page.evaluate(() => window.__perFrame)).filter((count) => count > 0)
  const histogram = {}
  for (const count of frames) histogram[count] = (histogram[count] ?? 0) + 1
  return { renderedFrames: frames.length, drawCallsPerFrame: histogram }
}

const labelsOnScreen = (page) =>
  page.evaluate(() => {
    const labels = [...document.querySelectorAll('[data-slot="graph-3d-label"]')].filter((label) => getComputedStyle(label).display !== "none")
    const roles = {}
    for (const label of labels) roles[label.dataset.role] = (roles[label.dataset.role] ?? 0) + 1
    const visibleTooltip = document.querySelector('[data-slot="graph-3d-tooltip"]') !== null
    return { labels: labels.length, roles, tooltip: visibleTooltip }
  })

const result = { nodes: nodeCount, prefix }
fs.mkdirSync(outDir, { recursive: true })
const { server, origin } = await serve(dist)
const browser = await chromium.launch({
  executablePath: headlessShell,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
})
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await page.addInitScript(drawCounter)
  page.on("pageerror", (error) => console.error("pageerror:", error.message))
  // rotate=1 is the demo default; the orb is left alone long enough to be moving when sampled.
  await page.goto(`${origin}/index.html?n=${nodeCount}&theme=dark&tone=void`)
  await page.waitForSelector('[data-slot="graph-3d"][data-state="ready"]', { timeout: 60_000 })
  await page.waitForSelector('canvas[data-settled="true"]', { timeout: 180_000 })
  await page.waitForTimeout(1500)

  // 1. At rest. Motion starts only after 8 s without a touch, so the page is left alone first.
  await page.waitForTimeout(9000)
  result.atRest = { ...(await sampleDraws(page, 2500)), ...(await labelsOnScreen(page)) }
  await page.screenshot({ path: path.join(outDir, `${prefix}-rest.png`) })

  // 2. Hover. Sweep the canvas until a node answers (a label of role hover, or the tooltip before labels).
  const box = await page.locator('[data-slot="graph-3d-canvas"]').boundingBox()
  const hoverShown = () =>
    page.evaluate(
      () => document.querySelector('[data-slot="graph-3d-label"][data-role="hover"]') !== null ||
        document.querySelector('[data-slot="graph-3d-tooltip"]') !== null,
    )
  let found = false
  for (let y = box.y + box.height * 0.3; y < box.y + box.height * 0.7 && !found; y += 8) {
    for (let x = box.x + box.width * 0.32; x < box.x + box.width * 0.68; x += 8) {
      await page.mouse.move(x, y)
      await page.waitForTimeout(25)
      if (await hoverShown()) { found = true; break }
    }
  }
  result.hoverFound = found
  if (found) {
    await page.waitForTimeout(500)
    result.hovered = { ...(await sampleDraws(page, 1500)), ...(await labelsOnScreen(page)) }
    await page.screenshot({ path: path.join(outDir, `${prefix}-hover.png`) })
  }

  // 3. Zoom in with the wheel until the hottest labels show (or the wheel runs out), pointer off the nodes.
  await page.mouse.move(box.x + box.width / 2, box.y + 4)
  await page.waitForTimeout(300)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let step = 0; step < 6; step++) {
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(250)
  }
  await page.mouse.move(box.x + 2, box.y + 2)
  await page.waitForTimeout(1200)
  result.zoomed = { ...(await sampleDraws(page, 1500)), ...(await labelsOnScreen(page)) }
  await page.screenshot({ path: path.join(outDir, `${prefix}-zoomed.png`) })
  await context.close()
} finally {
  await browser.close()
  server.close()
  fs.rmSync(dist, { recursive: true, force: true })
}
console.log(JSON.stringify(result, null, 2))
