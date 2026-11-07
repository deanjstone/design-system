#!/usr/bin/env node
// The curve-geometry gate (design-system#143): drives the registry blocks, or a
// consumer's dev URL, through the inset matrix in Playwright Chromium and fails
// when text or a control reaches into a display curve, the Dynamic Island or the
// home-indicator band. See docs/geometry-gate.md.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"

import { captureScreenshot } from "./capture.mjs"
import { CHECK_SCENARIOS,classify, runChecks, runLoginEdges } from "./checks.mjs"
import { collectGeometry, drawOverlay } from "./collect.mjs"
import { HARNESS_DIST, VIEWS, buildHarness, openScenario, serve } from "./session.mjs"
import { DISPLAY_RADIUS, SCENARIOS, findViolations, islandBoxes, protectedBandTop } from "./geometry.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")

const parseArgs = (argv) => {
  const args = { scenario: [], view: [], out: path.join(repo, "geometry-gate-out"), url: null, build: true, list: false, screenshots: true, checks: true, contrast: true, updateAria: false }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (flag === "--scenario") args.scenario.push(argv[++index])
    else if (flag === "--view") args.view.push(argv[++index])
    else if (flag === "--out") args.out = path.resolve(argv[++index])
    else if (flag === "--url") args.url = argv[++index]
    else if (flag === "--no-build") args.build = false
    else if (flag === "--no-screenshots") args.screenshots = false
    else if (flag === "--no-checks") args.checks = false
    else if (flag === "--no-contrast") args.contrast = false
    else if (flag === "--update-aria") args.updateAria = true
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
  await captureScreenshot(page, { path: file })
}

export const runGeometry = async ({ browser, urlFor, scenarios, views, out, screenshots }) => {
  const failures = []
  let runs = 0
  for (const scenario of scenarios) {
    for (const view of views) {
      const { context, page } = await openScenario(browser, scenario, urlFor(view))
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

const formatFinding = ({ check, scenario, view, label, detail }) => `  [${check}] ${scenario} / ${view}: ${label} ${detail}`

// Token contrast is pure Node, so it runs first and fails fast: the same vitest files
// CI runs, rather than a second copy of the maths.
const runContrast = () => {
  const result = spawnSync("pnpm", ["vitest", "run", "test/theme-contrast.test.ts", "test/theme-tokens.test.ts"], { cwd: repo, encoding: "utf8" })
  const summary = /Tests\s+.*$/m.exec(result.stdout)?.[0] ?? "no test summary"
  console.log(`token contrast: ${result.status === 0 ? "pass" : "FAIL"} (${summary})`)
  if (result.status !== 0) console.log(result.stdout + result.stderr)
  return result.status === 0
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const scenarios = args.scenario.length ? SCENARIOS.filter((scenario) => args.scenario.includes(scenario.name)) : SCENARIOS
  const views = args.url ? [{ name: "url", query: "" }] : args.view.length ? VIEWS.filter((view) => args.view.includes(view.name)) : VIEWS
  if (args.list) {
    console.log(`scenarios: ${SCENARIOS.map((scenario) => scenario.name).join(", ")}\nviews: ${VIEWS.map((view) => view.name).join(", ")}`)
    return 0
  }
  if (!scenarios.length || !views.length) throw new Error("no scenario or view matched")

  let ok = true
  if (args.contrast && !args.url) ok = runContrast()
  if (!ok) return 1

  let server
  let urlFor
  if (args.url) {
    urlFor = () => args.url
  } else {
    const dist = args.build ? buildHarness() : HARNESS_DIST
    let origin
    ;({ server, origin } = await serve(dist))
    urlFor = (view) => `${origin}/?${view.query}`
  }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.GATE_CHROMIUM || undefined })
  try {
    const { runs, failures } = await runGeometry({ browser, urlFor, scenarios, views, out: args.out, screenshots: args.screenshots })
    console.log(`geometry gate: chromium ${browser.version()}, ${runs} page runs (${scenarios.length} scenarios x ${views.length} views)`)
    for (const failure of failures) console.log(formatFailure(failure))
    console.log(failures.length ? `curve geometry: FAIL ${failures.length} violation(s); screenshots in ${args.out}` : "curve geometry: pass")
    ok = failures.length === 0

    if (args.checks) {
      const checkScenarios = scenarios.filter((scenario) => CHECK_SCENARIOS.includes(scenario.name))
      const findings = await runChecks({
        browser,
        urlFor,
        scenarios: checkScenarios,
        views,
        out: args.out,
        ariaDir: path.join(here, "aria"),
        updateAria: args.updateAria,
        aria: !args.url,
        glass: !args.url,
      })
      if (!args.url) findings.push(...(await runLoginEdges({ browser, urlFor, scenarios, views })))
      const covered = (entry) => checkScenarios.some((scenario) => !entry.scenario || entry.scenario === scenario.name) && views.some((view) => !entry.view || entry.view === view.name)
      const { fresh, known, stale } = classify(findings, args.url ? () => false : covered)
      for (const finding of known) console.log(`${formatFinding(finding)} (known, #${finding.issue})`)
      for (const finding of fresh) console.log(formatFinding(finding))
      for (const entry of stale) console.log(`  [stale] KNOWN entry no longer fires (${entry.check} ${entry.view ?? "any"} ${entry.label}, #${entry.issue}): delete it from scripts/geometry-gate/checks.mjs`)
      const clean = fresh.length === 0 && stale.length === 0
      console.log(clean ? `page checks: pass (${known.length} known)` : `page checks: FAIL ${fresh.length} new, ${stale.length} stale`)
      ok = ok && clean
    }
    console.log(ok ? "geometry gate: pass" : "geometry gate: FAIL")
    return ok ? 0 : 1
  } finally {
    await browser.close()
    server?.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (error) => { console.error(error); process.exit(2) })
}
