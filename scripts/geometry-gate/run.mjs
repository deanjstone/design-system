#!/usr/bin/env node
// The curve-geometry gate (design-system#143): drives the registry blocks, or a
// consumer's dev URL, through the inset matrix in Playwright Chromium and fails
// when text or a control reaches into a display curve, the Dynamic Island or the
// home-indicator band. See docs/geometry-gate.md.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

import { collectGeometry, drawOverlay } from "./collect.mjs"
import { HARNESS_DIST, VIEWS, buildHarness, openScenario, serve } from "./session.mjs"
import { DISPLAY_RADIUS, SCENARIOS, findViolations, islandBoxes, protectedBandTop } from "./geometry.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")

const parseArgs = (argv) => {
  const args = { scenario: [], view: [], out: path.join(repo, "geometry-gate-out"), url: null, build: true, list: false, screenshots: true }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (flag === "--scenario") args.scenario.push(argv[++index])
    else if (flag === "--view") args.view.push(argv[++index])
    else if (flag === "--out") args.out = path.resolve(argv[++index])
    else if (flag === "--url") args.url = argv[++index]
    else if (flag === "--no-build") args.build = false
    else if (flag === "--no-screenshots") args.screenshots = false
    else if (flag === "--list") args.list = true
    else throw new Error(`unknown argument ${flag}`)
  }
  return args
}

// A scrolling page is measured at its top and at its end. In each position only the
// half of the page at rest at that edge is held to it, because the other half is
// scrolling past the opposite edge on its way to or from view. Fixed and sticky
// chrome is checked in both. A page that does not scroll is checked whole.
const measure = async (page, scenario) => {
  const { height } = scenario.viewport
  const scrollable = (await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)) > 1
  const atRest = (position) => (item) =>
    !scrollable || item.pinned || (position === "top" ? item.rect.top < height / 2 : item.rect.bottom > height / 2)
  const positions = [{ name: "top", items: await page.evaluate(collectGeometry) }]
  if (scrollable) {
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
    positions.push({ name: "bottom", items: await page.evaluate(collectGeometry) })
    await page.evaluate(() => scrollTo(0, 0))
  }
  return positions.flatMap(({ name, items }) =>
    findViolations(items.filter(atRest(name)), scenario).map((violation) => ({ ...violation, scroll: name })),
  )
}

const screenshot = async (page, scenario, violations, file) => {
  await page.evaluate(drawOverlay, {
    scenario,
    radius: DISPLAY_RADIUS,
    islands: islandBoxes(scenario),
    bandTop: protectedBandTop(scenario),
    offenders: violations.filter((violation) => violation.scroll === "top").map((violation) => violation.rect),
  })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await page.screenshot({ path: file })
}

export const runGeometry = async ({ browser, origin, scenarios, views, out, screenshots, path: pagePath = "/" }) => {
  const failures = []
  let runs = 0
  for (const scenario of scenarios) {
    for (const view of views) {
      const url = `${origin}${pagePath}${view.query ? `?${view.query}` : ""}`
      const { context, page } = await openScenario(browser, scenario, url)
      const violations = await measure(page, scenario)
      if (screenshots) await screenshot(page, scenario, violations, path.join(out, "curves", `${scenario.name}__${view.name}${violations.length ? "__FAIL" : ""}.png`))
      await context.close()
      runs++
      for (const violation of violations) failures.push({ scenario: scenario.name, view: view.name, ...violation })
    }
  }
  return { runs, failures }
}

const formatFailure = ({ scenario, view, rule, kind, label, rect, detail, scroll }) =>
  `  [${rule}] ${scenario} / ${view} (scrolled ${scroll}): ${kind} ${label} at ${rect.left.toFixed(1)},${rect.top.toFixed(1)}..${rect.right.toFixed(1)},${rect.bottom.toFixed(1)} ${detail}`

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const scenarios = args.scenario.length ? SCENARIOS.filter((scenario) => args.scenario.includes(scenario.name)) : SCENARIOS
  const views = args.url ? [{ name: "url", query: "" }] : args.view.length ? VIEWS.filter((view) => args.view.includes(view.name)) : VIEWS
  if (args.list) {
    console.log(`scenarios: ${SCENARIOS.map((scenario) => scenario.name).join(", ")}\nviews: ${VIEWS.map((view) => view.name).join(", ")}`)
    return 0
  }
  if (!scenarios.length || !views.length) throw new Error("no scenario or view matched")

  let server
  let origin
  let pagePath = "/"
  if (args.url) {
    const target = new URL(args.url)
    origin = target.origin
    pagePath = `${target.pathname}${target.search}`
    views[0].query = ""
  } else {
    const dist = args.build ? buildHarness() : (HARNESS_DIST)
    ;({ server, origin } = await serve(dist))
  }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.GATE_CHROMIUM || undefined })
  try {
    const { runs, failures } = await runGeometry({ browser, origin, scenarios, views, out: args.out, screenshots: args.screenshots, path: pagePath })
    console.log(`geometry gate: chromium ${browser.version()}, ${runs} page runs (${scenarios.length} scenarios x ${views.length} views)`)
    for (const failure of failures) console.log(formatFailure(failure))
    console.log(failures.length ? `geometry gate: FAIL ${failures.length} violation(s); screenshots in ${args.out}` : "geometry gate: pass")
    return failures.length ? 1 : 0
  } finally {
    await browser.close()
    server?.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (error) => { console.error(error); process.exit(2) })
}
