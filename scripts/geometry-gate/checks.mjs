// The page checks beyond curve geometry (design-system#143, scope from the #144
// audit): target size, input font-size, reduced motion, an aria snapshot per block,
// the Tab loop, a 320px / 200% text context, and axe's target-size and
// scrollable-region-focusable. They run in the same emulated iPhone contexts.
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"

import { MODES, THEME_NAMES, contrastRatio } from "../theme/extract-t3.mjs"
import { GLASS_BARS, TOUCH_TARGET, focusObscured, glassLabels, inputFontSize, motion, reflow, sampleBackdrop, targetSize } from "./page-checks.mjs"
import { openScenario } from "./session.mjs"

const require = createRequire(import.meta.url)
const AXE_SOURCE = require.resolve("axe-core/axe.min.js")

export const CHECK_SCENARIOS = ["iphone-17-portrait", "iphone-17-landscape-top-0"]
// Findings the #144 audit already filed. A listed finding is reported, not failed, so
// the gate can land green; a listed entry that no longer fires fails the gate until
// it is deleted, so the list only shrinks (the same rule as test/theme-contrast.test.ts).
export const KNOWN = [
  { check: "reduced-motion", view: "states", label: "[spinner]", issue: 147 },
  { check: "reduced-motion", view: "states", label: "[skeleton]", issue: 147 },
]

const matches = (known, finding) =>
  known.check === finding.check &&
  (!known.scenario || known.scenario === finding.scenario) &&
  (!known.view || known.view === finding.view) &&
  finding.label.includes(known.label)

// Splits findings into new ones (fail) and known ones, and lists the KNOWN entries
// that matched nothing. `scope` limits the stale check to what this run covered.
export const classify = (findings, scope = () => true) => {
  const known = findings.filter((finding) => KNOWN.some((entry) => matches(entry, finding)))
  const fresh = findings.filter((finding) => !known.includes(finding))
  const stale = KNOWN.filter((entry) => scope(entry) && !findings.some((finding) => matches(entry, finding)))
  return { fresh, known: known.map((finding) => ({ ...finding, issue: KNOWN.find((entry) => matches(entry, finding)).issue })), stale }
}

// The AppShell's glass bars carry labels over whatever scrolls beneath them (design-system#146,
// #144 C6). For every theme and mode, at the top and the end of the page, each label is measured
// against the bar as painted: the labels are hidden, the page is screenshotted, and the pixels
// under each label's rect are the backdrop. Text must clear 4.5:1 (WCAG 1.4.3), an icon 3:1 (1.4.11).
const GLASS_VIEW = "shell"
const GLASS_TEXT = 4.5
const GLASS_ICON = 3
const hex = (channels) => `#${channels.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`

export const glassContrast = async (page, scenario, theme, mode) => {
  const findings = []
  await page.evaluate(({ theme, mode }) => {
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle("dark", mode === "dark")
  }, { theme, mode })
  await page.addStyleTag({ content: "* { transition: none !important }" })
  const hide = await page.addStyleTag({ content: `${GLASS_BARS.split(", ").map((bar) => `${bar} *`).join(", ")} { color: transparent !important }` })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  for (const position of ["top", "end"]) {
    await page.evaluate((to) => scrollTo(0, to === "end" ? document.documentElement.scrollHeight : 0), position)
    // The labels' colours are read with them showing, then they are hidden for the screenshot.
    await hide.evaluate((element) => { element.disabled = true })
    const labels = await page.evaluate(glassLabels, GLASS_BARS)
    await hide.evaluate((element) => { element.disabled = false })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const png = (await page.screenshot()).toString("base64")
    const grounds = await page.evaluate(sampleBackdrop, { png, scale: 3, rects: labels.map((label) => label.rect) })
    labels.forEach((label, at) => {
      const { r, g, b, a } = label.color
      const worst = Math.min(
        ...grounds[at].map((ground) => {
          const painted = [r, g, b].map((value, index) => value * a + ground[index] * (1 - a))
          return contrastRatio(hex(painted), hex(ground))
        }),
      )
      const minimum = label.kind === "icon" ? GLASS_ICON : GLASS_TEXT
      if (worst < minimum) {
        findings.push({ check: "glass-contrast", label: `${theme}/${mode} ${label.bar} ${label.kind} "${label.text}" (scrolled ${position})`, detail: `${worst.toFixed(2)}:1 over the painted bar, under ${minimum}:1` })
      }
    })
  }
  return findings
}

const REFLOW_VIEWPORT = { width: 320, height: 568 }

const axeFindings = async (page) => {
  await page.addScriptTag({ path: AXE_SOURCE })
  const results = await page.evaluate(() =>
    window.axe.run(document, { runOnly: { type: "rule", values: ["target-size", "scrollable-region-focusable"] }, resultTypes: ["violations"] }),
  )
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({ check: `axe:${violation.id}`, label: node.target.join(" "), detail: node.failureSummary?.split("\n")[1]?.trim() ?? violation.help })),
  )
}

// Tab from the top until focus leaves the page or returns to the first stop.
const tabLoop = async (page) => {
  const findings = []
  const seen = new Set()
  for (let press = 0; press < 80; press++) {
    await page.keyboard.press("Tab")
    const stop = await page.evaluate(focusObscured)
    if (!stop || seen.has(stop.label)) break
    seen.add(stop.label)
    if (stop.obscured) findings.push({ check: "focus-obscured", label: stop.label, detail: stop.detail })
  }
  return findings
}

const ariaSnapshot = async (page) => (await page.locator("body").ariaSnapshot()).trimEnd() + "\n"

export const runChecks = async ({ browser, urlFor, scenarios, views, out, ariaDir, updateAria, aria = true, glass = true }) => {
  const findings = []
  const tag = (list, scenario, view) => list.map((finding) => ({ scenario: scenario.name, view: view.name, ...finding }))
  for (const scenario of scenarios) {
    for (const view of views) {
      const { context, page } = await openScenario(browser, scenario, urlFor(view))
      findings.push(...tag(await page.evaluate(targetSize), scenario, view))
      findings.push(...tag(await page.evaluate(targetSize, TOUCH_TARGET), scenario, view))
      findings.push(...tag(await page.evaluate(inputFontSize), scenario, view))
      findings.push(...tag(await axeFindings(page), scenario, view))
      findings.push(...tag(await tabLoop(page), scenario, view))
      if (aria && scenario.name === CHECK_SCENARIOS[0]) {
        const file = path.join(ariaDir, `${view.name}.yml`)
        const snapshot = await ariaSnapshot(page)
        fs.mkdirSync(out, { recursive: true })
        fs.mkdirSync(path.join(out, "aria"), { recursive: true })
        fs.writeFileSync(path.join(out, "aria", `${view.name}.yml`), snapshot)
        if (updateAria) {
          fs.mkdirSync(ariaDir, { recursive: true })
          fs.writeFileSync(file, snapshot)
        } else if (!fs.existsSync(file)) {
          findings.push(...tag([{ check: "aria-snapshot", label: view.name, detail: `no baseline at ${path.relative(process.cwd(), file)}; run with --update-aria` }], scenario, view))
        } else if (fs.readFileSync(file, "utf8") !== snapshot) {
          findings.push(...tag([{ check: "aria-snapshot", label: view.name, detail: `differs from ${path.relative(process.cwd(), file)}; see ${path.relative(process.cwd(), path.join(out, "aria", `${view.name}.yml`))}, or run with --update-aria` }], scenario, view))
        }
      }
      await context.close()
    }
  }
  const shell = views.find((view) => view.name === GLASS_VIEW)
  if (glass && shell) {
    const scenario = scenarios.find((entry) => entry.name === CHECK_SCENARIOS[0]) ?? scenarios[0]
    for (const theme of THEME_NAMES) {
      for (const mode of MODES) {
        const { context, page } = await openScenario(browser, scenario, urlFor(shell))
        findings.push(...tag(await glassContrast(page, scenario, theme, mode), scenario, shell))
        await context.close()
      }
    }
  }
  const portrait = scenarios.find((scenario) => scenario.name === CHECK_SCENARIOS[0]) ?? scenarios[0]
  for (const view of views) {
    const reflowContext = await openScenario(browser, portrait, urlFor(view), { viewport: REFLOW_VIEWPORT })
    await reflowContext.page.addStyleTag({ content: "html { font-size: 200% !important }" })
    await reflowContext.page.waitForTimeout(300)
    findings.push(...tag(await reflowContext.page.evaluate(reflow), { name: "320px-200pct" }, view))
    await reflowContext.context.close()
    const reduced = await openScenario(browser, portrait, urlFor(view), { reducedMotion: "reduce", settled: false })
    findings.push(...tag(await reduced.page.evaluate(motion), { name: "reduced-motion" }, view))
    await reduced.context.close()
  }
  return findings
}
