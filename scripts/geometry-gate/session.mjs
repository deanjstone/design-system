// Shared by the geometry run and the page checks: the views the harness renders,
// the static server for its build, and one emulated iPhone context.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { settle } from "./collect.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")

export const HARNESS_DIST = process.env.GATE_OUT ?? path.join(repo, "node_modules/.cache/geometry-gate/dist")

export const VIEWS = [
  { name: "shell", query: "v=shell" },
  { name: "shell-focus", query: "v=shell-focus" },
  { name: "login", query: "v=login" },
  ...["top", "right", "bottom", "left"].map((side) => ({ name: `sheet-${side}`, query: `v=sheet&side=${side}` })),
  { name: "dialog", query: "v=dialog" },
  { name: "alert-dialog", query: "v=alert-dialog" },
  { name: "drawer", query: "v=drawer" },
  { name: "states", query: "v=states" },
  { name: "toast-bottom", query: "v=toast&position=bottom-center" },
  { name: "toast-top", query: "v=toast&position=top-center" },
]

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" }

export const serve = (dir) =>
  new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const pathname = new URL(request.url, "http://x").pathname
      const file = path.join(dir, pathname === "/" ? "index.html" : pathname)
      if (!file.startsWith(dir) || !fs.existsSync(file)) {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(fs.readFileSync(file))
    })
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }))
  })

export const buildHarness = () => {
  const result = spawnSync("npx", ["vite", "build", "-c", path.join(here, "harness/vite.config.mjs")], { cwd: repo, stdio: "inherit" })
  if (result.status !== 0) throw new Error("harness build failed")
  return HARNESS_DIST
}

// One emulated iPhone: the scenario's viewport and CDP safe-area insets. `viewport`
// overrides the size (the 320px reflow context), `settled: false` returns before the
// page stops moving (the reduced-motion check reads the entrance animations).
export const openScenario = async (browser, scenario, url, { reducedMotion = "no-preference", viewport = scenario.viewport, settled = true } = {}) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion,
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: scenario.insets })
  await page.goto(url)
  if (settled) await page.evaluate(settle)
  return { context, page }
}
