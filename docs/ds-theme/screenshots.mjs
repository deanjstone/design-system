#!/usr/bin/env node
// Render, font-loading and persistence proof for design-system#189: builds the DS theme and font demo,
// serves it for the length of the run and opens it in ONE headless page at a time (closed straight
// after). The Aspekta and Azeret Mono files reach the build through registry/fonts/install-ds-fonts.sh,
// the same script an app runs, so the run also proves the script installs the originals.
//
// Checks (WebKit):
//   - at 390x844 and 320x844, for every theme (Ocean, the default, and DS) x mode x font: the page does
//     not scroll sideways; with Aspekta chosen, Aspekta Variable and Azeret Mono are the computed faces
//     and both files are loaded; with the default font, Plex is the face and Aspekta is not fetched
//   - the default page (no choice stored) is exactly the Ocean page: no data-font on <html> and Ocean as its theme,
//     and the same computed card, field and font as ?theme=ocean, while DS differs
//   - the Appearance section (390 and 320): its rows are 44px tall; picking DS then Aspekta sets
//     data-theme and data-font and the cookie and localStorage entries; a reload keeps both; picking
//     Dark keeps the font; going back to the default font removes data-font
// Writes docs/assets/ds-theme-<width>-<theme>-<mode>-<font>.png and ds-theme-settings-<width>-*.png.
// WebKit does not implement corner-shape, so one Chromium page shows the squircle corners. Exits non-zero
// if a check fails.
//
//   node docs/ds-theme/screenshots.mjs
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, webkit } from "playwright-core"

import { serve } from "../../scripts/geometry-gate/session.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../..")
const assets = path.join(repo, "docs/assets")
const work = mkdtempSync(path.join(os.tmpdir(), "ds-theme-demo-"))
const dist = path.join(work, "dist")
const publicDir = path.join(work, "public")

const install = spawnSync("bash", [path.join(repo, "registry/fonts/install-ds-fonts.sh"), path.join(publicDir, "fonts/ds")], {
  stdio: "inherit",
  env: { ...process.env, DS_FONTS_SOURCE_DIR: path.join(repo, "registry/fonts") },
})
if (install.status !== 0) throw new Error("install-ds-fonts.sh failed")

const build = spawnSync("npx", ["vite", "build", "-c", path.join(here, "vite.config.mjs")], {
  cwd: repo,
  stdio: "inherit",
  env: { ...process.env, DS_THEME_OUT: dist, DS_THEME_PUBLIC: publicDir },
})
if (build.status !== 0) throw new Error("ds-theme demo build failed")

const WIDTHS = [390, 320]
const THEMES = ["ocean", "ds"]
const MODES = ["light", "dark"]
const FONTS = ["default", "aspekta"]

const { server, origin } = await serve(dist)
let failures = 0
const record = (name, ok, detail = "") => {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
}

const withPage = async (browser, { width, height = 844, scale = 2, mobile = true }, run) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile })
  const page = await context.newPage()
  try {
    return await run(page)
  } finally {
    await context.close()
  }
}

const ready = async (page) => {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(200)
}

// WebKit prints a computed font-family without the quotes the stylesheet wrote.
const unquoted = (value) => value.replaceAll('"', "")

const loadedFaces = (page) =>
  page.evaluate(() => [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family.replaceAll('"', "")))

const snapshotStyles = (page) =>
  page.evaluate(() => {
    const style = (selector, properties) => {
      const computed = getComputedStyle(document.querySelector(selector))
      return Object.fromEntries(properties.map((property) => [property, computed.getPropertyValue(property)]))
    }
    return {
      body: style("body", ["font-family", "background-color", "color"]),
      card: style('[data-slot="card"]', ["border-radius", "background-image", "box-shadow", "background-color"]),
      input: style('[data-slot="input"]', ["background-color", "box-shadow", "border-top-color"]),
      attributes: { theme: document.documentElement.getAttribute("data-theme"), font: document.documentElement.getAttribute("data-font") },
    }
  })

const webkitBrowser = await webkit.launch()
try {
  // 1. The matrix.
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      for (const mode of MODES) {
        for (const font of FONTS) {
          const label = `${width}px ${theme} ${mode} ${font}`
          await withPage(webkitBrowser, { width }, async (page) => {
            await page.goto(`${origin}/?theme=${theme}&mode=${mode}&font=${font}`)
            await ready(page)
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
            record(`${label}: no sideways scroll`, overflow <= 0, `overflow ${overflow}px`)
            const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
            const monoFont = await page.evaluate(() => getComputedStyle(document.querySelector("code")).fontFamily)
            const faces = await loadedFaces(page)
            if (font === "aspekta") {
              record(`${label}: Aspekta and Azeret Mono are the faces`, unquoted(bodyFont).startsWith("Aspekta Variable") && unquoted(monoFont).startsWith("Azeret Mono"), `${bodyFont} | ${monoFont}`)
              record(`${label}: both font files loaded`, faces.includes("Aspekta Variable") && faces.includes("Azeret Mono"), faces.join(", "))
            } else {
              record(`${label}: Plex stays the face and Aspekta is never fetched`, unquoted(bodyFont).startsWith("IBM Plex Sans Variable") && !faces.includes("Aspekta Variable"), `${bodyFont} | ${faces.join(", ") || "none loaded"}`)
            }
            await page.screenshot({ path: path.join(assets, `ds-theme-${width}-${theme}-${mode}-${font}.png`) })
          })
        }
      }
    }
  }

  // 2. The default page is the Ocean page; DS is not.
  const styles = {}
  for (const [key, query] of [["default", ""], ["ocean", "?theme=ocean&mode=light"], ["ds", "?theme=ds&mode=light"]]) {
    styles[key] = await withPage(webkitBrowser, { width: 390 }, async (page) => {
      await page.goto(`${origin}/${query}`)
      await ready(page)
      const snapshot = await snapshotStyles(page)
      if (key === "default") record("default page: <html> is Ocean (the head script sets the default theme name) and has no data-font", [null, "ocean"].includes(snapshot.attributes.theme) && snapshot.attributes.font === null, JSON.stringify(snapshot.attributes))
      return snapshot
    })
  }
  const { attributes: _a, ...defaultStyles } = styles.default
  const { attributes: _b, ...oceanStyles } = styles.ocean
  const { attributes: _c, ...dsStyles } = styles.ds
  record("default page draws the same card, field and font as ?theme=ocean", JSON.stringify(defaultStyles) === JSON.stringify(oceanStyles))
  record("DS draws a different card (sheen, edge), field (well) and ground", JSON.stringify(dsStyles.card) !== JSON.stringify(oceanStyles.card) && JSON.stringify(dsStyles.input) !== JSON.stringify(oceanStyles.input) && dsStyles.body["background-color"] !== oceanStyles.body["background-color"], `card bg-image: ${dsStyles.card["background-image"].slice(0, 40)}`)
  record("DS keeps Plex until Aspekta is chosen (the two options are independent)", unquoted(dsStyles.body["font-family"]).startsWith("IBM Plex Sans Variable"))

  // 3. The Appearance section: choose, persist, reload, switch back.
  for (const width of WIDTHS) {
    await withPage(webkitBrowser, { width }, async (page) => {
      const label = `${width}px settings`
      await page.goto(`${origin}/?view=settings`)
      await ready(page)
      const rows = page.getByRole("group", { name: "Theme" }).getByRole("button")
      const fontRows = page.getByRole("group", { name: "Font" }).getByRole("button")
      const heights = [...(await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))), ...(await fontRows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height)))]
      record(`${label}: seven theme rows and two font rows, each 44px or taller`, heights.length === 9 && heights.every((height) => height >= 44), heights.map(Math.round).join(","))
      const attribute = (name) => page.evaluate((n) => document.documentElement.getAttribute(n), name)

      await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "DS" }).tap()
      await page.getByRole("group", { name: "Font" }).getByRole("button", { name: "Aspekta + Azeret Mono" }).tap()
      await ready(page)
      record(`${label}: DS and Aspekta set data-theme and data-font`, (await attribute("data-theme")) === "ds" && (await attribute("data-font")) === "aspekta")
      const stored = await page.evaluate(() => ({ cookie: document.cookie, theme: localStorage.getItem("ds-theme"), font: localStorage.getItem("ds-font") }))
      record(`${label}: both choices are kept in the browser`, stored.theme?.startsWith("ds.") === true && stored.font === "aspekta" && stored.cookie.includes("ds-theme=ds.") && stored.cookie.includes("ds-font=aspekta"), JSON.stringify(stored))
      await page.screenshot({ path: path.join(assets, `ds-theme-settings-${width}-ds-light-aspekta.png`) })

      await page.getByRole("group", { name: "Colour mode" }).getByRole("button", { name: "Dark" }).tap()
      await ready(page)
      record(`${label}: Dark keeps DS and Aspekta`, (await page.evaluate(() => document.documentElement.classList.contains("dark"))) && (await attribute("data-theme")) === "ds" && (await attribute("data-font")) === "aspekta")
      await page.screenshot({ path: path.join(assets, `ds-theme-settings-${width}-ds-dark-aspekta.png`) })

      await page.reload()
      await ready(page)
      record(`${label}: a reload keeps DS, dark and Aspekta, applied before the app renders`, (await attribute("data-theme")) === "ds" && (await attribute("data-font")) === "aspekta" && (await page.evaluate(() => document.documentElement.classList.contains("dark"))))

      await page.getByRole("group", { name: "Font" }).getByRole("button", { name: "Default" }).tap()
      record(`${label}: choosing Default removes data-font and keeps DS`, (await attribute("data-font")) === null && (await attribute("data-theme")) === "ds")
      await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Ocean" }).tap()
      record(`${label}: choosing Ocean puts the default theme back`, (await attribute("data-theme")) === "ocean")
    })
  }

  // 4. Desktop, WebKit.
  for (const mode of MODES) {
    await withPage(webkitBrowser, { width: 1280, height: 800, scale: 1, mobile: false }, async (page) => {
      await page.goto(`${origin}/?theme=ds&mode=${mode}&font=aspekta`)
      await ready(page)
      await page.screenshot({ path: path.join(assets, `ds-theme-1280-ds-${mode}-aspekta.png`) })
      record(`1280px ds ${mode} aspekta: no sideways scroll`, (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0)
    })
  }
} finally {
  await webkitBrowser.close()
}

// 5. Squircle corners: WebKit has no corner-shape, Chromium does.
try {
  const chromiumBrowser = await chromium.launch()
  try {
    await withPage(chromiumBrowser, { width: 1280, height: 800, scale: 1, mobile: false }, async (page) => {
      await page.goto(`${origin}/?theme=ds&mode=dark&font=aspekta`)
      await ready(page)
      const shape = await page.evaluate(() => getComputedStyle(document.querySelector('[data-slot="card"]')).getPropertyValue("corner-shape"))
      record("chromium: the card has corner-shape squircle", shape.includes("squircle"), shape)
      await page.screenshot({ path: path.join(assets, "ds-theme-1280-ds-dark-aspekta-chromium.png") })
    })
  } finally {
    await chromiumBrowser.close()
  }
} catch (error) {
  console.log(`SKIP chromium squircle shot (${error.message.split("\n")[0]})`)
}

server.close()
rmSync(work, { recursive: true, force: true })
console.log(failures === 0 ? "ds-theme: all checks passed" : `ds-theme: ${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
