// The reading scorecard: what is measured on a rendered screen, and the thresholds a screen is
// held to. `measure` runs inside the page (render.mjs passes it to page.evaluate, so it must
// not close over anything). `score` runs in Node on the raw numbers, so a threshold can change
// without rendering anything again.
//
// The four needs and the reading-comfort row come from the audit brief. Where the brief gives
// a number it is used as given; the two thresholds it leaves open are marked "audit's own".

export const RULES = {
  fontSizesInFirstViewport: 3,
  largestRatio: 1.2, // the largest text is at least this much bigger than the next size down
  largestElements: 2, // and at most this many elements share it
  chipsPerRow: 1,
  coloursPerRow: 2,
  interactiveInFirstViewport: 15, // audit's own: the brief says count, not how many is too many
  alphaSteps: 4, // audit's own, as above
  tapTarget: 44,
  inputFontSize: 16,
  thumbZoneFrom: 0.6, // the bottom 40% of the viewport
  bodyFontSize: 16,
  lineLength: [45, 75],
  contrast: 4.5,
  contrastLarge: 3,
}

export function measure(options) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const round = (value) => Math.round(value * 10) / 10

  // --- colour ---------------------------------------------------------------
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  const colourCache = new Map()
  const parse = (value) => {
    if (!value || value === "transparent" || value === "none") return { r: 0, g: 0, b: 0, a: 0 }
    if (colourCache.has(value)) return colourCache.get(value)
    let result
    const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value)
    if (rgb) {
      const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith("%") ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4])
      result = { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alpha }
    } else {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = "#000"
      ctx.fillStyle = value
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      result = { r, g, b, a: Math.round((a / 255) * 100) / 100 }
    }
    colourCache.set(value, result)
    return result
  }
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 })
  const linear = (channel) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = (c) => 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b)
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  // OKLCH chroma and hue, to tell a neutral from a colour and to name the hue family.
  const oklch = (c) => {
    const [r, g, b] = [linear(c.r), linear(c.g), linear(c.b)]
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    return { chroma: Math.hypot(A, B), hue: (Math.atan2(B, A) * 180) / Math.PI + (B < 0 ? 360 : 0) }
  }
  const hex = (c) => "#" + [c.r, c.g, c.b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")
  const NEUTRAL_CHROMA = 0.05
  const chromatic = (c) => c.a > 0.04 && oklch(c).chroma >= NEUTRAL_CHROMA
  const statusFamily = (c) => {
    const { chroma, hue } = oklch(c)
    if (chroma < 0.07) return null
    if (hue >= 10 && hue < 45) return "red"
    if (hue >= 45 && hue < 110) return "amber"
    if (hue >= 125 && hue < 165) return "green"
    return null
  }

  // --- elements -------------------------------------------------------------
  const styleOf = (el) => getComputedStyle(el)
  const visible = (el) => {
    const style = styleOf(el)
    if (style.display === "none" || style.visibility !== "visible") return false
    const box = el.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) return false
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const up = styleOf(node)
      if (Number(up.opacity) === 0 || node.getAttribute("aria-hidden") === "true") return false
      // Screen-reader-only text: clipped to a pixel.
      const clip = node.getBoundingClientRect()
      if ((up.overflow !== "visible" || up.clipPath !== "none") && (clip.width <= 2 || clip.height <= 2)) return false
    }
    return true
  }
  // The fixed or sticky layer an element is drawn in, if any.
  const layerOf = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const position = styleOf(node).position
      if (position === "fixed" || position === "sticky") return node
    }
    return null
  }
  const inFirst = (box) => box.bottom > 0 && box.top < vh && box.right > 0 && box.left < vw
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40)

  const background = (el) => {
    const layers = []
    let image = false
    for (let node = el; node; node = node.parentElement) {
      const style = styleOf(node)
      if (style.backgroundImage !== "none") image = true
      const colour = parse(style.backgroundColor)
      if (colour.a > 0) layers.push(colour)
      if (colour.a === 1) break
    }
    let result = { r: 255, g: 255, b: 255, a: 1 }
    for (const layer of layers.reverse()) result = over(layer, result)
    return { colour: result, image }
  }

  // Every run of text the reader can see, with the box the text itself takes.
  const texts = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  while (walker.nextNode()) {
    const node = walker.currentNode
    const content = node.textContent.trim()
    if (content.length === 0) continue
    const el = node.parentElement
    if (!el || ["SCRIPT", "STYLE", "NOSCRIPT", "OPTION"].includes(el.tagName) || !visible(el)) continue
    range.selectNodeContents(node)
    const box = range.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) continue
    const style = styleOf(el)
    let opacity = 1
    for (let up = el; up; up = up.parentElement) opacity *= Number(styleOf(up).opacity)
    const colour = parse(style.color)
    // Text another element is drawn over (a floating header or tab bar) is not there to be read.
    let covered = false
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    if (x >= 0 && x < vw && y >= 0 && y < vh && style.pointerEvents !== "none") {
      // Covered means another fixed or sticky layer is on top; a stretched link over a card is
      // in the same layer as the card's text and hides nothing.
      const hit = document.elementFromPoint(x, y)
      const layer = hit ? layerOf(hit) : null
      covered = Boolean(layer) && layer !== layerOf(el) && !layer.contains(el)
    }
    texts.push({ el, box, content, covered, size: round(parseFloat(style.fontSize)), weight: Number(style.fontWeight), colour: { ...colour, a: colour.a * opacity }, font: style.font })
  }
  const firstTexts = texts.filter((text) => inFirst(text.box) && !text.covered)
  const coveredTexts = texts.filter((text) => inFirst(text.box) && text.covered)

  // --- hierarchy ------------------------------------------------------------
  const sizeChars = {}
  for (const text of firstTexts) sizeChars[text.size] = (sizeChars[text.size] ?? 0) + text.content.length
  const sizes = Object.keys(sizeChars).map(Number).sort((a, b) => b - a)
  const largest = firstTexts.filter((text) => text.size === sizes[0])
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].filter((el) => visible(el) && inFirst(el.getBoundingClientRect()))
  // A heading is as big and as heavy as the text drawn inside it, which a button in the heading
  // can set apart from the heading element's own style.
  const headingInfo = headings.map((el) => {
    const inside = texts.filter((text) => el.contains(text.el) && !text.covered)
    return { tag: el.tagName.toLowerCase(), text: label(el), size: Math.max(0, ...inside.map((text) => text.size)), weight: Math.max(0, ...inside.map((text) => text.weight)), top: round(el.getBoundingClientRect().top) }
  }).filter((heading) => heading.size > 0)

  // --- rows -----------------------------------------------------------------
  // A row is an element marked as one (a list item, a table row, a *-row or *-item slot), or one
  // of three or more same-shaped siblings, each a wide strip with text in it.
  const rows = []
  const strip = (el) => {
    const box = el.getBoundingClientRect()
    return visible(el) && box.height >= 28 && box.height <= 220 && box.width >= Math.min(0.55 * vw, 320) && el.textContent.trim().length > 0 && !el.querySelector("input:not([type=checkbox]),select,textarea")
  }
  const SKIP_ROWS = 'nav,[role="tablist"],[role="navigation"],[role="menu"],[role="toolbar"],thead'
  for (const parent of document.querySelectorAll("body *")) {
    if (parent.children.length < 3 || parent.closest(SKIP_ROWS) || rows.some((row) => row.contains(parent))) continue
    const groups = new Map()
    for (const child of parent.children) {
      const key = `${child.tagName}|${child.getAttribute("data-slot") ?? child.classList[0] ?? ""}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(child)
    }
    for (const group of groups.values()) {
      const strips = group.filter(strip)
      // Rows of one list are about the same height, and a strip that is nothing but buttons is
      // a toolbar, not a row.
      const median = strips.map((child) => child.getBoundingClientRect().height).sort((a, b) => a - b)[Math.floor(strips.length / 2)]
      const alike = strips.filter((child) => {
        const height = child.getBoundingClientRect().height
        const ownText = [...child.querySelectorAll("*")].some((el) => !el.closest("button,[role=tab],select,input") && [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim().length > 1))
        // A row can be one big button; a toolbar is several.
        return height >= median * 0.6 && height <= median * 1.7 && (ownText || child.matches("a,li,tr") || child.querySelectorAll("button,[role=tab]").length <= 2)
      })
      if (alike.length >= 3) rows.push(...alike)
    }
  }
  for (const el of document.querySelectorAll('li,[role="listitem"],tbody tr,[role="row"],[data-slot$="-row"],[data-slot$="-item"],[data-slot="item"]')) {
    if (el.closest(SKIP_ROWS) || !strip(el) || rows.some((row) => row.contains(el) || el.contains(row))) continue
    rows.push(el)
  }
  const sides = (style) => ["Top", "Right", "Bottom", "Left"].filter((side) => parseFloat(style[`border${side}Width`]) > 0 && parse(style[`border${side}Color`]).a > 0.04).length
  const isCard = (el) => {
    const style = styleOf(el)
    return sides(style) >= 3 || (style.boxShadow !== "none" && !/^rgba?\(0, 0, 0, 0\)/.test(style.boxShadow))
  }
  const describeRow = (row) => {
    const rowBox = row.getBoundingClientRect()
    const rowBackground = background(row).colour
    const chips = []
    const colours = new Map()
    let nested = 0
    const note = (colour) => {
      if (!chromatic(colour)) return
      colours.set(Math.round(oklch(colour).hue / 30) % 12, hex(colour))
    }
    for (const el of row.querySelectorAll("*")) {
      if (!visible(el)) continue
      const style = styleOf(el)
      const box = el.getBoundingClientRect()
      const fill = parse(style.backgroundColor)
      note(fill)
      if (sides(style) > 0) note(parse(style.borderTopColor))
      if (el.tagName.toLowerCase() === "svg") note(parse(style.color))
      const text = el.textContent.trim()
      const filled = fill.a > 0.04 && hex(over(fill, rowBackground)) !== hex(rowBackground)
      const chipLike = el.getAttribute("data-slot") === "badge" || (box.height >= 14 && box.height <= 30 && box.width <= rowBox.width * 0.5 && text.length > 0 && text.length <= 28 && parseFloat(style.borderTopLeftRadius) > 0 && (filled || sides(style) === 4) && !["BUTTON", "INPUT", "SELECT"].includes(el.tagName))
      if (chipLike && !chips.some((chip) => chip.el.contains(el))) chips.push({ el, text: text.slice(0, 20) })
      else if (!chipLike && isCard(el) && (box.height > 30 || box.width > rowBox.width * 0.5) && isCard(row)) nested += 1
    }
    if (isCard(row) && row.parentElement && [row.parentElement, row.parentElement.parentElement].some((up) => up && up !== document.body && isCard(up))) nested += 1
    const inside = texts.filter((text) => row.contains(text.el))
    for (const text of inside) note(text.colour)
    const title = [...inside].sort((a, b) => b.size - a.size || b.weight - a.weight)[0]
    return { height: round(rowBox.height), chips: chips.length, chipTexts: chips.map((chip) => chip.text), colours: colours.size, colourValues: [...colours.values()], nested, titleWeight: title?.weight ?? null, titleSize: title?.size ?? null, titleText: title?.content.slice(0, 30) ?? "" }
  }
  const rowInfo = rows.slice(0, 40).map(describeRow)

  // --- interactive ----------------------------------------------------------
  const INTERACTIVE = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"],[role="radio"],[tabindex]:not([tabindex="-1"])'
  const interactive = [...document.querySelectorAll(INTERACTIVE)].filter((el) => visible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true")
  const hitSize = (el) => {
    const box = el.getBoundingClientRect()
    let width = box.width
    let height = box.height
    for (const pseudo of ["::after", "::before"]) {
      const style = getComputedStyle(el, pseudo)
      if (style.content === "none" || style.position !== "absolute") continue
      width = Math.max(width, parseFloat(style.width) || 0)
      height = Math.max(height, parseFloat(style.height) || 0)
    }
    // A control inside a label is as big as the label.
    const wrapper = el.closest("label")
    if (wrapper) {
      const outer = wrapper.getBoundingClientRect()
      width = Math.max(width, outer.width)
      height = Math.max(height, outer.height)
    }
    return { width: round(width), height: round(height) }
  }
  const inlineLink = (el) => el.tagName === "A" && styleOf(el).display.startsWith("inline") && el.parentElement.textContent.trim().length > el.textContent.trim().length + 20
  const small = []
  let measured = 0
  for (const el of interactive) {
    const box = el.getBoundingClientRect()
    if (box.top > vh * 2 || box.bottom < 0 || inlineLink(el)) continue
    measured += 1
    const size = hitSize(el)
    if (size.width < options.tapTarget - 0.5 || size.height < options.tapTarget - 0.5) small.push({ what: label(el), tag: el.tagName.toLowerCase(), ...size })
  }
  const inputs = [...document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]),select,textarea,[contenteditable="true"]')].filter(visible)
  const smallInputs = inputs.filter((el) => parseFloat(styleOf(el).fontSize) < options.inputFontSize - 0.01).map((el) => ({ what: label(el), tag: el.tagName.toLowerCase(), size: round(parseFloat(styleOf(el).fontSize)) }))

  // --- every control, so the primary action can be picked after the render ---
  const primaryFill = (() => {
    const value = styleOf(document.documentElement).getPropertyValue("--primary").trim()
    return value ? parse(value) : null
  })()
  const controls = []
  for (const el of interactive) {
    const box = el.getBoundingClientRect()
    if (box.top > vh * 2 || box.bottom < 0 || controls.length >= 80) continue
    let pinned = false
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const style = styleOf(node)
      if ((style.position === "fixed" || style.position === "sticky") && node.getBoundingClientRect().bottom > vh * 0.75) pinned = true
    }
    const fill = parse(styleOf(el).backgroundColor)
    const filled = Boolean(primaryFill && fill.a > 0.9 && Math.abs(fill.r - primaryFill.r) <= 3 && Math.abs(fill.g - primaryFill.g) <= 3 && Math.abs(fill.b - primaryFill.b) <= 3)
    controls.push({ what: label(el), tag: el.tagName.toLowerCase(), top: round(box.top), bottom: round(box.bottom), left: round(box.left), inFirstViewport: box.top >= 0 && box.bottom <= vh, centreAt: round((box.top + box.height / 2) / vh), pinnedToBottom: pinned, primaryFill: filled, ...hitSize(el) })
  }

  // --- state ----------------------------------------------------------------
  const root = styleOf(document.documentElement)
  const token = (name) => {
    const value = root.getPropertyValue(name).trim()
    return value ? parse(value) : null
  }
  const statusTokens = ["--warning", "--success", "--critical", "--unreachable", "--destructive"].map((name) => ({ name, colour: token(name) })).filter((entry) => entry.colour && entry.colour.a > 0)
  const near = (a, b) => Math.abs(a.r - b.r) <= 3 && Math.abs(a.g - b.g) <= 3 && Math.abs(a.b - b.b) <= 3
  const offToken = new Map()
  let statusColoured = 0
  let colourOnly = 0
  const colourOnlySamples = []
  const alphas = new Set()
  for (const el of document.querySelectorAll("body *")) {
    const box = el.getBoundingClientRect()
    if (box.top > vh * 2 || box.bottom < 0 || !visible(el)) continue
    const style = styleOf(el)
    const hasText = [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim().length > 0)
    const candidates = [parse(style.backgroundColor)]
    if (sides(style) > 0) candidates.push(parse(style.borderTopColor))
    if (hasText || el.tagName.toLowerCase() === "svg") candidates.push(parse(style.color))
    if (inFirst(box)) {
      for (const colour of candidates) if (colour.a > 0 && colour.a < 1) alphas.add(Math.round(colour.a * 100) / 100)
      if (Number(style.opacity) < 1) alphas.add(Math.round(Number(style.opacity) * 100) / 100)
    }
    for (const colour of candidates) {
      if (colour.a <= 0.04) continue
      const family = statusFamily(colour)
      if (!family) continue
      statusColoured += 1
      if (!statusTokens.some((entry) => near(entry.colour, colour))) {
        const key = hex(colour)
        if (!offToken.has(key)) offToken.set(key, { colour: key, family, count: 0, sample: label(el) })
        offToken.get(key).count += 1
      }
      const carriesMeaning = el.textContent.trim().length > 0 || el.tagName.toLowerCase() === "svg" || el.querySelector("svg") || el.getAttribute("aria-label") || (el.parentElement && el.parentElement.textContent.trim().length > 0)
      if (!carriesMeaning) {
        colourOnly += 1
        if (colourOnlySamples.length < 5) colourOnlySamples.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
      }
      break
    }
  }
  const groupLabels = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"],[data-slot*="heading"],[data-slot*="title"],[role="tab"],summary')].filter(visible).map((el) => el.textContent.trim())
  const empties = [...document.querySelectorAll('[data-slot="empty"],[data-slot="empty-page"],[data-empty],[data-slot="empty-state"]')].filter(visible)

  // --- reading comfort ------------------------------------------------------
  const prose = firstTexts.filter((text) => !text.el.closest('button,input,select,textarea,nav,[role="tablist"],[role="tab"],h1,h2,h3,h4'))
  const proseChars = {}
  // Where every word on the screen sits inside a control (a list of button rows), the body
  // text is whatever those rows are set in.
  if (prose.length === 0) prose.push(...firstTexts.filter((text) => !text.el.closest('nav,[role="tablist"],[role="tab"],input,select,textarea')))
  for (const text of prose) proseChars[text.size] = (proseChars[text.size] ?? 0) + text.content.length
  const bodySize = Object.entries(proseChars).sort((a, b) => b[1] - a[1])[0]
  const lines = []
  for (const text of texts) {
    if (text.content.length < 140) continue
    const lineHeight = parseFloat(styleOf(text.el).lineHeight) || text.size * 1.4
    if (text.box.height < lineHeight * 1.8) continue
    ctx.font = text.font
    const zero = ctx.measureText("0").width || text.size * 0.55
    lines.push({ ch: Math.round(text.el.getBoundingClientRect().width / zero), size: text.size, sample: text.content.slice(0, 30) })
  }
  const contrastFails = []
  let contrastChecked = 0
  let contrastUnknown = 0
  for (const text of texts) {
    if (text.box.top > vh * 2 || text.box.bottom < 0) continue
    // WCAG 1.4.3 exempts an inactive control.
    if (text.el.closest(':disabled,[aria-disabled="true"]')) continue
    const ground = background(text.el)
    if (ground.image) {
      contrastUnknown += 1
      continue
    }
    contrastChecked += 1
    const ratio = contrast(over(text.colour, ground.colour), ground.colour)
    const large = text.size >= 24 || (text.size >= 18.66 && text.weight >= 700)
    if (ratio < (large ? options.contrastLarge : options.contrast) - 0.005) contrastFails.push({ text: text.content.slice(0, 30), ratio: Math.round(ratio * 100) / 100, size: text.size, colour: hex(over(text.colour, ground.colour)), on: hex(ground.colour) })
  }
  const animations = typeof document.getAnimations === "function" ? document.getAnimations().filter((animation) => animation.playState === "running" && (animation.effect?.getComputedTiming().duration ?? 0) > 10).length : null

  return {
    viewport: [vw, vh],
    coarse: matchMedia("(pointer: coarse)").matches,
    hierarchy: {
      fontSizes: sizes.map((size) => ({ size, chars: sizeChars[size] })),
      largest: { size: sizes[0] ?? null, elements: largest.length, weight: Math.max(0, ...largest.map((text) => text.weight)), text: largest[0]?.content.slice(0, 40) ?? "", nextSize: sizes[1] ?? null },
      headings: headingInfo.slice(0, 8),
    },
    rows: { count: rows.length, sample: rowInfo.slice(0, 6), maxChips: Math.max(0, ...rowInfo.map((row) => row.chips)), maxColours: Math.max(0, ...rowInfo.map((row) => row.colours)), nested: rowInfo.filter((row) => row.nested > 0).length, heights: [...new Set(rowInfo.map((row) => Math.round(row.height)))].sort((a, b) => a - b), titleWeightMax: Math.max(0, ...rowInfo.map((row) => row.titleWeight ?? 0)) },
    interactive: { firstViewport: interactive.filter((el) => inFirst(el.getBoundingClientRect())).length, measured, small: small.length, smallSample: small.slice(0, 10), inputs: inputs.length, smallInputs },
    controls,
    alphaSteps: [...alphas].sort((a, b) => a - b),
    state: { statusTokens: statusTokens.map((entry) => `${entry.name} ${hex(entry.colour)}`), statusColoured, offToken: [...offToken.values()].sort((a, b) => b.count - a.count).slice(0, 8), colourOnly, colourOnlySamples, countsInHeadings: groupLabels.filter((text) => /\d/.test(text)).length, progressText: firstTexts.filter((text) => /\b\d+\s*(?:of|\/)\s*\d+\b|\b\d+(?:\.\d+)?\s?%/.test(text.content)).length, usesSafeTokens: root.getPropertyValue("--safe-t").trim().length > 0, progressElements: document.querySelectorAll('progress,meter,[role="progressbar"],[data-slot="progress"]').length, empties: empties.map((el) => ({ text: label(el), actions: el.querySelectorAll(INTERACTIVE).length })) },
    reading: { bodySize: bodySize ? Number(bodySize[0]) : null, lines, contrastChecked, contrastUnknown, contrastFails: contrastFails.slice(0, 12), contrastFailCount: contrastFails.length, overflowX: document.documentElement.scrollWidth - vw, runningAnimations: animations },
    textRuns: texts.length,
    covered: { runs: coveredTexts.length, sample: coveredTexts.slice(0, 6).map((text) => `${text.content.slice(0, 30)} (${text.size}px at ${Math.round(text.box.top)})`) },
  }
}

const result = (pass, detail) => ({ pass, detail })
const NA = (detail) => ({ pass: null, detail })

// Pass, fail or not applicable for each scorecard line, from one screen's raw measurements.
// `variants` is keyed iphone-light, iphone-dark, desktop-light, desktop-dark, iphone-320,
// iphone-reduced-motion; `screen` carries the per-screen facts the config states.
export function score(screen, variants) {
  const phone = variants["iphone-light"]
  if (!phone || phone.error) return { error: phone?.error ?? "no iPhone measurement" }
  const desktop = variants["desktop-light"]
  const { hierarchy, rows, interactive, state, reading } = phone
  // primaryAction: null (the screen has none), "auto" (the first control filled with --primary)
  // or "text=<part of its label>".
  const wanted = screen.primaryAction
  const primary = !wanted ? null : wanted === "auto" ? phone.controls.find((control) => control.primaryFill) : phone.controls.find((control) => control.what.toLowerCase().includes(wanted.replace(/^text=/, "").toLowerCase()))
  const ratio = hierarchy.largest.nextSize ? hierarchy.largest.size / hierarchy.largest.nextSize : Infinity
  const headingWeights = hierarchy.headings.map((heading) => heading.weight)
  // The same comparison on the desktop render: a row can change weight at a breakpoint.
  const wide = desktop && !desktop.error ? { headings: desktop.hierarchy.headings.map((heading) => heading.weight), rows: desktop.rows } : null
  const contrastOf = (name) => variants[name] && !variants[name].error ? variants[name].reading.contrastFailCount : null
  const contrasts = ["iphone-light", "iphone-dark", "desktop-light", "desktop-dark"].map((name) => [name, contrastOf(name)])
  const lineLengths = desktop && !desktop.error ? desktop.reading.lines.map((line) => line.ch) : []

  return {
    hierarchy: {
      oneLargest: result(hierarchy.largest.elements <= RULES.largestElements && ratio >= RULES.largestRatio, `${hierarchy.largest.size}px ×${hierarchy.largest.elements} "${hierarchy.largest.text}", next ${hierarchy.largest.nextSize}px`),
      fontSizes: result(hierarchy.fontSizes.length <= RULES.fontSizesInFirstViewport, hierarchy.fontSizes.map((entry) => entry.size).join("/")),
      pageTitleVisible: result(hierarchy.headings.some((heading) => heading.tag === "h1"), hierarchy.headings.find((heading) => heading.tag === "h1") ? `h1 "${hierarchy.headings.find((heading) => heading.tag === "h1").text}"` : "no h1 on show in the first viewport"),
      headingVisible: result(hierarchy.headings.length > 0, hierarchy.headings[0] ? `${hierarchy.headings[0].tag} "${hierarchy.headings[0].text}" at ${hierarchy.headings[0].top}px` : "no heading in the first viewport"),
      headingOutweighsRows: rows.count === 0 || headingWeights.length === 0 ? NA("no rows or no heading") : result(Math.min(...headingWeights) >= rows.titleWeightMax, `heading ${headingWeights.join("/")}, row title ${rows.titleWeightMax}`),
      headingOutweighsRowsDesktop: !wide || wide.rows.count === 0 || wide.headings.length === 0 ? NA("no rows or no heading") : result(Math.min(...wide.headings) >= wide.rows.titleWeightMax, `heading ${wide.headings.join("/")}, row title ${wide.rows.titleWeightMax}`),
    },
    clutter: {
      chipsPerRow: rows.count === 0 ? NA("no rows") : result(rows.maxChips <= RULES.chipsPerRow, `max ${rows.maxChips} in ${rows.count} rows`),
      coloursPerRow: rows.count === 0 ? NA("no rows") : result(rows.maxColours <= RULES.coloursPerRow, `max ${rows.maxColours}`),
      noNestedBorders: rows.count === 0 ? NA("no rows") : result(rows.nested === 0, `${rows.nested} rows`),
      chipsPerRowDesktop: !wide || wide.rows.count === 0 ? NA("no rows") : result(wide.rows.maxChips <= RULES.chipsPerRow, `max ${wide.rows.maxChips} in ${wide.rows.count} rows`),
      coloursPerRowDesktop: !wide || wide.rows.count === 0 ? NA("no rows") : result(wide.rows.maxColours <= RULES.coloursPerRow, `max ${wide.rows.maxColours}`),
      interactiveCount: result(interactive.firstViewport <= RULES.interactiveInFirstViewport, String(interactive.firstViewport)),
      alphaSteps: result(phone.alphaSteps.length <= RULES.alphaSteps, `${phone.alphaSteps.length}: ${phone.alphaSteps.join(", ")}`),
    },
    action: {
      primaryVisible: !screen.primaryAction ? NA("no primary action on this screen") : result(Boolean(primary?.inFirstViewport), primary ? `"${primary.what}" at ${primary.top}px` : "not found in the first two viewports"),
      primaryInThumbZone: !screen.primaryAction ? NA("no primary action on this screen") : result(Boolean(primary?.inFirstViewport && (primary.centreAt >= RULES.thumbZoneFrom || primary.pinnedToBottom)), primary ? `centre at ${Math.round(primary.centreAt * 100)}% of the viewport${primary.pinnedToBottom ? ", pinned to the bottom" : ""}` : "not found in the first two viewports"),
      tapTargets: result(interactive.small === 0, `${interactive.small} of ${interactive.measured} under ${RULES.tapTarget}px`),
      inputText: interactive.inputs === 0 ? NA("no inputs") : result(interactive.smallInputs.length === 0, `${interactive.smallInputs.length} of ${interactive.inputs} under ${RULES.inputFontSize}px`),
    },
    state: {
      moreThanColour: state.statusColoured === 0 ? NA("no status colour on screen") : result(state.colourOnly === 0, `${state.colourOnly} of ${state.statusColoured} carry colour alone`),
      statusFromTokens: state.statusColoured === 0 ? NA("no status colour on screen") : result(state.offToken.length === 0, state.offToken.map((entry) => `${entry.colour}×${entry.count}`).join(", ") || "all from tokens"),
      progressShown: !screen.expectsProgress ? NA("no goal on this screen") : result(state.countsInHeadings > 0 || state.progressElements > 0 || state.progressText > 0, `${state.countsInHeadings} counted headings, ${state.progressElements} progress elements, ${state.progressText} "n of m" or percent texts`),
      emptySaysNext: state.empties.length === 0 ? NA("no empty state on screen") : result(state.empties.every((empty) => empty.actions > 0), state.empties.map((empty) => `"${empty.text}": ${empty.actions} actions`).join("; ")),
    },
    reading: {
      bodyText: result((reading.bodySize ?? 0) >= RULES.bodyFontSize, `${reading.bodySize}px`),
      lineLength: lineLengths.length === 0 ? NA("no wrapped paragraph on desktop") : result(lineLengths.every((ch) => ch >= RULES.lineLength[0] && ch <= RULES.lineLength[1]), `${Math.min(...lineLengths)} to ${Math.max(...lineLengths)}ch`),
      contrast: result(contrasts.every(([, fails]) => fails === 0), contrasts.map(([name, fails]) => `${name} ${fails ?? "n/a"}`).join(", ")),
      noSidewaysScroll: result(reading.overflowX <= 0 && (variants["iphone-320"]?.reading?.overflowX ?? 0) <= 0, `390: ${reading.overflowX}px, 320: ${variants["iphone-320"]?.reading?.overflowX ?? "n/a"}px`),
      reducedMotion: variants["iphone-reduced-motion"]?.reading ? result(variants["iphone-reduced-motion"].reading.runningAnimations === 0, `${variants["iphone-reduced-motion"].reading.runningAnimations} running`) : NA("not measured"),
    },
  }
}
