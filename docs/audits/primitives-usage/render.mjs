#!/usr/bin/env node
// Screenshots an app's screens in headless WebKit and scores each one with scorecard.mjs.
//
//   node docs/audits/primitives-usage/render.mjs <config.json> [--only <screen>]
//   node docs/audits/primitives-usage/render.mjs <config.json> --rescore
//
// --rescore renders nothing: it reads the scorecard.json already beside the screenshots and
// works out pass and fail again from its raw measurements, with the config's current
// primaryAction and expectsProgress and scorecard.mjs's current thresholds.
//
// The app must already be served on localhost (a dev server or `vite preview`); this script
// starts nothing. It opens ONE page at a time. Every request that does not go to the app's own
// origin is answered from the config's `mocks` or aborted, and listed under `blocked` in the
// output, so a run cannot reach a live system.
//
// Config:
//   {
//     "app": "ops-hub-web",
//     "baseUrl": "http://127.0.0.1:4173",
//     "mocksFile": "mocks.json",       // optional: an array of mocks, beside the config
//     "initScriptFile": "init.js",     // optional: runs in the page before the app's own code
//     "mocks": [{ "url": "**/api/issues*", "method": "GET", "status": 200, "json": [] }],
//     "screens": [{ "name": "home", "path": "/", "waitFor": "h1", "primaryAction": "text=New issue", // or "auto", or null
//                   "expectsProgress": true, "why": "the first screen after sign-in" }]
//   }
// A mock gives `json`, `body` (a string) or `file` (a path beside the config). `url` is a glob:
// `*` matches within a path segment, `**` matches anything. Mocks are tried in order, before the
// same-origin rule, so they can stand in for the app's own /api too.
//
// Output goes beside the config. Per screen it writes <name>-iphone-{light,dark}.png, <name>-desktop-{light,dark}.png and, for
// the first screen, <name>-iphone-insets-light.png (the notch and home-indicator insets a
// standalone PWA gets, simulated by setting the registry's --safe-* tokens: headless WebKit
// reports zero for env(safe-area-inset-*)). scorecard.json holds the raw measurements and the
// pass or fail of every scorecard line.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { webkit } from "playwright-core"

import { RULES, measure, score } from "./scorecard.mjs"

const [configPath] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))
if (!configPath) {
  console.error("usage: render.mjs <config.json> [--only <screen>]")
  process.exit(2)
}
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null
const config = JSON.parse(readFileSync(configPath, "utf8"))
const origin = new URL(config.baseUrl).origin
if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(new URL(config.baseUrl).hostname)) {
  console.error(`baseUrl must be on localhost, got ${config.baseUrl}`)
  process.exit(2)
}
// Paths in the config are read beside the config file, which is also where output goes.
const beside = (file) => path.resolve(path.dirname(configPath), file)
config.out = config.out ? beside(config.out) : path.dirname(path.resolve(configPath))
if (config.mocksFile && existsSync(beside(config.mocksFile))) config.mocks = [...(config.mocks ?? []), ...JSON.parse(readFileSync(beside(config.mocksFile), "utf8"))]
if (config.initScriptFile && existsSync(beside(config.initScriptFile))) config.initScript = readFileSync(beside(config.initScriptFile), "utf8")
mkdirSync(config.out, { recursive: true })

if (process.argv.includes("--rescore")) {
  const file = path.join(config.out, "scorecard.json")
  const previous = JSON.parse(readFileSync(file, "utf8"))
  previous.rules = RULES
  for (const screen of previous.screens) {
    const current = config.screens.find((candidate) => candidate.name === screen.name) ?? screen
    Object.assign(screen, { why: current.why ?? "", primaryAction: current.primaryAction ?? null, expectsProgress: Boolean(current.expectsProgress), checks: score(current, screen.variants) })
  }
  writeFileSync(file, JSON.stringify(previous, null, 1) + "\n")
  console.log(`rescored ${previous.screens.length} screens in ${file}`)
  process.exit(0)
}

const glob = (pattern) => new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/?]*").replace(/\u0000/g, ".*") + "$")
const mocks = (config.mocks ?? []).map((mock) => ({ ...mock, pattern: glob(mock.url), hits: 0 }))
const blocked = new Map()
const unmocked = new Map()

// A service worker would answer requests the route handler never sees, so none may register.
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: "block" }
const VARIANTS = [
  { name: "iphone-light", context: { ...PHONE, colorScheme: "light" }, shot: true },
  { name: "iphone-dark", context: { ...PHONE, colorScheme: "dark" }, shot: true },
  { name: "desktop-light", context: { viewport: { width: 1440, height: 900 }, colorScheme: "light", serviceWorkers: "block" }, shot: true },
  { name: "desktop-dark", context: { viewport: { width: 1440, height: 900 }, colorScheme: "dark", serviceWorkers: "block" }, shot: true },
  { name: "iphone-320", context: { ...PHONE, viewport: { width: 320, height: 844 }, colorScheme: "light" }, shot: false },
  { name: "iphone-reduced-motion", context: { ...PHONE, colorScheme: "light", reducedMotion: "reduce" }, shot: false },
  { name: "iphone-insets-light", context: { ...PHONE, colorScheme: "light" }, shot: true, insets: true, firstScreenOnly: true },
]
// The insets of an iPhone with a Dynamic Island, portrait, as an installed PWA reports them.
const INSETS = ":root { --safe-t: 59px !important; --safe-b: 34px !important; --safe-l: 0px !important; --safe-r: 0px !important; }"

async function route(context) {
  await context.route("**/*", async (request) => {
    const url = request.request().url()
    if (url.startsWith("data:") || url.startsWith("blob:")) return request.continue()
    const mock = mocks.find((candidate) => candidate.pattern.test(url) && (!candidate.method || candidate.method === request.request().method()))
    if (mock) {
      mock.hits += 1
      const body = mock.file ? readFileSync(beside(mock.file), "utf8") : mock.json !== undefined ? JSON.stringify(mock.json) : (mock.body ?? "")
      return request.fulfill({ status: mock.status ?? 200, contentType: mock.contentType ?? "application/json", headers: { "access-control-allow-origin": "*", ...mock.headers }, body })
    }
    if (new URL(url).origin === origin) {
      // A data call to the app's own origin that no mock answers gets the static server's
      // reply, which is not what the app expects: list it so a fixture can be written.
      if (["fetch", "xhr", "eventsource"].includes(request.request().resourceType())) {
        const local = `${request.request().method()} ${url.replace(origin, "")}`
        unmocked.set(local, (unmocked.get(local) ?? 0) + 1)
      }
      return request.continue()
    }
    const key = `${request.request().method()} ${url.split("?")[0]}`
    blocked.set(key, (blocked.get(key) ?? 0) + 1)
    return request.abort()
  })
}

const browser = await webkit.launch()
const output = { app: config.app, baseUrl: config.baseUrl, rules: RULES, screens: [] }
try {
  const screens = config.screens.filter((screen) => !only || screen.name === only)
  for (const [index, screen] of screens.entries()) {
    const variants = {}
    for (const variant of VARIANTS) {
      if (variant.firstScreenOnly && index > 0) continue
      const context = await browser.newContext(variant.context)
      const errors = []
      try {
        await route(context)
        if (config.initScript) await context.addInitScript(config.initScript)
        const page = await context.newPage()
        page.on("pageerror", (error) => errors.push(String(error.message).slice(0, 200)))
        await page.goto(new URL(screen.path, config.baseUrl).href, { waitUntil: "load", timeout: 45_000 })
        let waited = true
        if (screen.waitFor) waited = await page.waitForSelector(screen.waitFor, { state: "visible", timeout: 20_000 }).then(() => true, () => false)
        await page.evaluate(() => document.fonts.ready)
        if (variant.insets) {
          const reads = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--safe-t").trim().length > 0)
          if (!reads) {
            variants[variant.name] = { skipped: "the app does not declare the registry's --safe-* tokens, so there is nothing to set" }
            console.log(`skip ${config.app} ${screen.name} ${variant.name}`)
            continue
          }
          await page.addStyleTag({ content: INSETS })
        }
        await page.waitForTimeout(800)
        const raw = await page.evaluate(measure, RULES)
        variants[variant.name] = { ...raw, waitForSeen: waited, pageErrors: errors, url: page.url().replace(origin, "") }
        if (variant.insets) {
          // What sits under the island or the home indicator once the insets are real.
          variants[variant.name].underInsets = await page.evaluate(() => [...document.querySelectorAll("a[href],button,input,select,textarea,[role=button],[role=tab]")].filter((el) => {
            const box = el.getBoundingClientRect()
            return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility === "visible" && (box.top < 59 || box.bottom > innerHeight - 34) && box.bottom > 0 && box.top < innerHeight
          }).map((el) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30)))
        }
        if (variant.shot) await page.screenshot({ path: path.join(config.out, `${screen.name}-${variant.name}.png`), scale: "css", type: "png" })
        console.log(`${waited ? "ok  " : "WAIT"} ${config.app} ${screen.name} ${variant.name}${errors.length ? ` (${errors.length} page errors)` : ""}`)
      } catch (error) {
        variants[variant.name] = { error: String(error.message).split("\n")[0].slice(0, 300) }
        console.log(`FAIL ${config.app} ${screen.name} ${variant.name}: ${variants[variant.name].error}`)
      } finally {
        await context.close()
      }
    }
    output.screens.push({ name: screen.name, path: screen.path, why: screen.why ?? "", primaryAction: screen.primaryAction ?? null, expectsProgress: Boolean(screen.expectsProgress), checks: score(screen, variants), variants })
  }
} finally {
  await browser.close()
}

output.mocks = mocks.map((mock) => ({ url: mock.url, method: mock.method ?? "any", hits: mock.hits }))
output.blocked = [...blocked].map(([request, count]) => ({ request, count })).sort((a, b) => b.count - a.count)
output.unmockedLocal = [...unmocked].map(([request, count]) => ({ request, count })).sort((a, b) => b.count - a.count)
writeFileSync(path.join(config.out, only ? `scorecard-${only}.json` : "scorecard.json"), JSON.stringify(output, null, 1) + "\n")

for (const screen of output.screens) {
  if (screen.checks.error) {
    console.log(`${screen.name}: ${screen.checks.error}`)
    continue
  }
  const lines = Object.entries(screen.checks).flatMap(([need, checks]) => Object.entries(checks).map(([name, check]) => `${check.pass === null ? "n/a " : check.pass ? "pass" : "FAIL"} ${need}.${name}: ${check.detail}`))
  console.log(`\n${config.app} / ${screen.name}\n  ${lines.join("\n  ")}`)
}
if (output.blocked.length > 0) console.log(`\nblocked (not mocked, not local):\n  ${output.blocked.map((entry) => `${entry.count}× ${entry.request}`).join("\n  ")}`)
if (output.unmockedLocal.length > 0) console.log(`\nsame-origin data calls with no mock:\n  ${output.unmockedLocal.map((entry) => `${entry.count}× ${entry.request}`).join("\n  ")}`)
