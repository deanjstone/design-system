#!/usr/bin/env node
// Rendered proof for design-system#169: builds the graph-3d demo, serves it for the
// length of the run, opens it in ONE headless Chromium tab and reports
//   - time until the force layout settles, and the frame rate while it settles
//   - the frame rate while the settled orb auto-rotates
//   - that hover shows a tooltip and a click focuses the node
//   - that prefers-reduced-motion leaves the settled graph still
// then writes dark and light screenshots and closes everything.
//
//   node docs/graph-3d/measure.mjs [--nodes 1300] [--out docs/assets]
//
// Headless Chromium on a machine with no GPU renders WebGL in software (SwiftShader),
// so the numbers are a floor, not a GPU figure; the script prints the renderer string.
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
const dist = path.join(os.tmpdir(), `graph-3d-demo-${process.pid}`)

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

const { server, origin } = await serve(dist)
const browser = await chromium.launch({
  executablePath: headlessShell,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
})

const frameRecorder = () => {
  window.__frames = []
  const tick = (now) => {
    window.__frames.push(now)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const summarise = (frames) => {
  const gaps = frames.slice(1).map((time, index) => time - frames[index]).sort((a, b) => a - b)
  const elapsed = (frames.at(-1) - frames[0]) / 1000
  return {
    frames: frames.length,
    seconds: Number(elapsed.toFixed(2)),
    fps: Number(((frames.length - 1) / elapsed).toFixed(1)),
    medianFrameMs: Number(gaps[Math.floor(gaps.length / 2)].toFixed(1)),
    p95FrameMs: Number(gaps[Math.floor(gaps.length * 0.95)].toFixed(1)),
  }
}

const result = { nodes: nodeCount }
try {
  const open = async (query, contextOptions = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...contextOptions })
    const page = await context.newPage()
    await page.addInitScript(frameRecorder)
    page.on("pageerror", (error) => console.error("pageerror:", error.message))
    await page.goto(`${origin}/index.html?n=${nodeCount}${query}`)
    return { context, page }
  }

  const { context, page } = await open("&theme=dark")
  await page.waitForSelector('[data-slot="graph-3d"][data-state="ready"]', { timeout: 60_000 })
  const startedAt = Date.now()
  await page.waitForSelector('canvas[data-settled="true"]', { timeout: 180_000 })
  result.settleSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1))
  result.settlingFrames = summarise(await page.evaluate(() => window.__frames))

  result.renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl")
    const info = gl?.getExtension("WEBGL_debug_renderer_info")
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown"
  })

  // Main-thread cost of our code per frame, apart from the GPU process (here a software
  // rasteriser), read from CDP's Performance metrics over the same window.
  const cdp = await context.newCDPSession(page)
  await cdp.send("Performance.enable")
  const metric = async (name) => (await cdp.send("Performance.getMetrics")).metrics.find((entry) => entry.name === name).value
  const before = { task: await metric("TaskDuration"), script: await metric("ScriptDuration") }
  await page.evaluate(() => { window.__frames = [] })
  await page.waitForTimeout(6000)
  result.rotatingFrames = summarise(await page.evaluate(() => window.__frames))
  const taskSeconds = (await metric("TaskDuration")) - before.task
  const scriptSeconds = (await metric("ScriptDuration")) - before.script
  result.mainThreadMsPerFrame = {
    allTasks: Number(((taskSeconds * 1000) / result.rotatingFrames.frames).toFixed(2)),
    script: Number(((scriptSeconds * 1000) / result.rotatingFrames.frames).toFixed(2)),
  }
  result.autoRotate = await page.getAttribute('[data-slot="graph-3d"]', "data-auto-rotate")

  fs.mkdirSync(outDir, { recursive: true })
  await page.screenshot({ path: path.join(outDir, "graph-3d-1300-dark.png") })

  // Hover and click: sweep the canvas until a node tooltip appears, then click it.
  const box = await page.locator('[data-slot="graph-3d-canvas"]').boundingBox()
  let hoveredLabel = null
  for (let y = box.y + box.height * 0.25; y < box.y + box.height * 0.75 && !hoveredLabel; y += 9) {
    for (let x = box.x + box.width * 0.3; x < box.x + box.width * 0.7; x += 9) {
      await page.mouse.move(x, y)
      await page.waitForTimeout(25)
      hoveredLabel = await page.locator('[data-slot="graph-3d-tooltip"]').first().textContent({ timeout: 50 }).catch(() => null)
      if (hoveredLabel) break
    }
  }
  result.hoverTooltip = hoveredLabel
  if (hoveredLabel) {
    await page.mouse.down()
    await page.mouse.up()
    await page.waitForTimeout(900)
    result.clickFocused = await page.getByTestId("clicked").textContent()
  }
  await context.close()

  const light = await open("&theme=light")
  await light.page.waitForSelector('canvas[data-settled="true"]', { timeout: 180_000 })
  await light.page.waitForTimeout(1500)
  await light.page.screenshot({ path: path.join(outDir, "graph-3d-1300-light.png") })
  await light.context.close()

  const reduced = await open("&theme=dark", { reducedMotion: "reduce" })
  await reduced.page.waitForSelector('canvas[data-settled="true"]', { timeout: 180_000 })
  await reduced.page.evaluate(() => { window.__frames = [] })
  await reduced.page.waitForTimeout(3000)
  result.reducedMotion = {
    attribute: await reduced.page.getAttribute('[data-slot="graph-3d"]', "data-reduced-motion"),
    autoRotate: await reduced.page.getAttribute('[data-slot="graph-3d"]', "data-auto-rotate"),
    // A graph at rest paints nothing new, so the page schedules no extra frames beyond rAF's own ticks.
    screenshotsIdentical: await (async () => {
      const first = await reduced.page.screenshot()
      await reduced.page.waitForTimeout(1500)
      return first.equals(await reduced.page.screenshot())
    })(),
  }
  await reduced.context.close()
} finally {
  await browser.close()
  server.close()
  fs.rmSync(dist, { recursive: true, force: true })
}
console.log(JSON.stringify(result, null, 2))
