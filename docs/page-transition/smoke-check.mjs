#!/usr/bin/env node
// Browser proof for design-system#198: builds the page-transition demo, serves it for the run and
// drives it in headless Chromium, ONE page at a time, closed straight after. Checks
//   - with WebGL, a press runs a real sweep: a glimm canvas appears, the view changes, the sweep settles
//   - with prefers-reduced-motion: reduce, the view changes at once and no canvas is ever created
//   - with no WebGL context, the view changes at once and nothing throws
//   - after the WebGL context is lost, the next press is a plain cut
//   - the click's event duration (an INP proxy) and the glimm bundle cost, tree-shaken
// Writes mid-sweep screenshots to docs/assets/page-transition-*.png. Exits non-zero if a check fails.
// Headless Chromium draws WebGL in software (SwiftShader), so timings are an upper bound on a GPU.
//
//   node docs/page-transition/smoke-check.mjs
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { build as viteBuild } from "vite"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const assets = path.join(repo, "docs/assets")
const dist = path.join(os.tmpdir(), `page-transition-demo-${process.pid}`)
const probeDist = path.join(os.tmpdir(), `page-transition-probe-${process.pid}`)

const headlessShell = fs
  .readdirSync(path.join(os.homedir(), ".cache/ms-playwright"))
  .filter((name) => name.startsWith("chromium_headless_shell-"))
  .sort()
  .map((name) => path.join(os.homedir(), ".cache/ms-playwright", name, "chrome-headless-shell-linux64/chrome-headless-shell"))
  .reverse()
  .find((candidate) => fs.existsSync(candidate))

const results = []
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

const built = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, PAGE_TRANSITION_OUT: dist },
})
if (built.status !== 0) throw new Error("page-transition demo build failed")

// Bundle cost of glimm alone: build just the two imports the item makes, React external, tree-shaken.
const probeFile = path.join(here, "bundle-probe.mjs")
fs.writeFileSync(probeFile, 'export { GlimmProvider, useGlimm } from "glimm/react"\nexport { accentChain } from "glimm"\n')
try {
  await viteBuild({
    root: repo,
    configFile: false,
    logLevel: "silent",
    build: {
      outDir: probeDist,
      emptyOutDir: true,
      minify: true,
      lib: { entry: probeFile, formats: ["es"], fileName: "probe" },
      rollupOptions: { external: ["react", "react-dom", "react/jsx-runtime"] },
    },
  })
} finally {
  fs.rmSync(probeFile, { force: true })
}
const probe = fs.readFileSync(path.join(probeDist, "probe.mjs"))
console.log(`glimm (GlimmProvider + useGlimm + accentChain, tree-shaken, React external): ${probe.length} B min, ${gzipSync(probe).length} B gzip`)
const demoJs = fs.readdirSync(path.join(dist, "assets")).filter((name) => name.endsWith(".js"))
const demoBytes = demoJs.reduce((sum, name) => sum + gzipSync(fs.readFileSync(path.join(dist, "assets", name))).length, 0)
console.log(`whole demo JS (React + Base UI + shadcn parts + glimm): ${demoBytes} B gzip`)

const { server, origin } = await serve(dist)
const browser = await chromium.launch({
  executablePath: headlessShell,
  args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
})

const scenario = async (name, { reducedMotion = "no-preference", noWebgl = false, dark = false, theme = "ocean" } = {}, run) => {
  const context = await browser.newContext({ viewport: { width: 760, height: 560 }, reducedMotion })
  const page = await context.newPage()
  const errors = []
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()))
  page.on("pageerror", (error) => errors.push(error.message))
  if (noWebgl) {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
        return /webgl/.test(String(kind)) ? null : original.call(this, kind, ...rest)
      }
    })
  }
  await page.addInitScript(() => {
    window.__events = []
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => entry.name === "click" && window.__events.push(entry.duration))).observe({
      type: "event",
      durationThreshold: 16,
      buffered: true,
    })
  })
  try {
    await page.goto(origin)
    await page.waitForSelector('[data-testid="view"]')
    if (theme !== "ocean") await page.getByRole("button", { name: theme, exact: true }).click()
    if (dark) await page.getByRole("button", { name: "Light", exact: true }).click()
    await run(page)
    record(`${name}: no console errors`, errors.length === 0, errors.join(" | "))
  } finally {
    await context.close()
  }
}

const view = (page) => page.getByTestId("view").getAttribute("data-view")
const sweeps = async (page) => Number(await page.getByTestId("sweeps").textContent())
const pressBilling = (page) => page.getByRole("button", { name: "Billing", exact: true }).click()

try {
  await scenario("light, WebGL", {}, async (page) => {
    const webgl = await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl")))
    record("headless Chromium has WebGL (software), so the sweep can be proven", webgl)
    await pressBilling(page)
    await page.waitForTimeout(450)
    const canvases = await page.locator("canvas").count()
    record("a sweep canvas appears during the press", canvases > 0, `${canvases} canvas`)
    await page.screenshot({ path: path.join(assets, "page-transition-light.png") })
    await page.waitForFunction(() => document.querySelector('[data-testid="sweeps"]')?.textContent === "1", null, { timeout: 8000 })
    record("the view changed to Billing and the sweep settled", (await view(page)) === "billing" && (await sweeps(page)) === 1)
    const durations = await page.evaluate(() => window.__events)
    console.log(`click event duration (input delay + handler + next paint), ms: ${durations.length ? durations.join(", ") : "all under 16"}`)
    record("the click's event duration stays under 200 ms (INP 'good')", durations.every((duration) => duration < 200), `max ${Math.max(0, ...durations)}`)

    await page.evaluate(() => {
      document.querySelectorAll("canvas").forEach((canvas) => canvas.getContext("webgl")?.getExtension("WEBGL_lose_context")?.loseContext())
    })
    await page.waitForTimeout(100)
    const started = Date.now()
    await page.getByRole("button", { name: "Settings", exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-testid="sweeps"]')?.textContent === "2", null, { timeout: 3000 })
    record("after the context is lost the next press is a plain cut", (await view(page)) === "settings" && Date.now() - started < 500, `${Date.now() - started} ms`)
  })

  await scenario("dark iris, WebGL", { dark: true, theme: "iris" }, async (page) => {
    await pressBilling(page)
    await page.waitForTimeout(450)
    await page.screenshot({ path: path.join(assets, "page-transition-dark-iris.png") })
    await page.waitForFunction(() => document.querySelector('[data-testid="sweeps"]')?.textContent === "1", null, { timeout: 8000 })
    record("dark iris sweep settles", (await view(page)) === "billing")
  })

  await scenario("reduced motion", { reducedMotion: "reduce" }, async (page) => {
    await pressBilling(page)
    await page.waitForFunction(() => document.querySelector('[data-testid="sweeps"]')?.textContent === "1", null, { timeout: 1000 })
    record("reduced motion: the view changed at once", (await view(page)) === "billing")
    record("reduced motion: no WebGL canvas was ever created", (await page.locator("canvas").count()) === 0)
  })

  await scenario("no WebGL", { noWebgl: true }, async (page) => {
    await pressBilling(page)
    await page.waitForFunction(() => document.querySelector('[data-testid="sweeps"]')?.textContent === "1", null, { timeout: 1000 })
    record("no WebGL: the view changed at once", (await view(page)) === "billing")
  })
} finally {
  await browser.close()
  server.close()
  fs.rmSync(dist, { recursive: true, force: true })
  fs.rmSync(probeDist, { recursive: true, force: true })
}

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
