// Runs inside the page (Playwright serialises it), so it must stay self-contained.
// Returns every interactive element's rect and every text line's rect, in viewport
// coordinates. Backgrounds, borders and shadows are not collected: they are exempt.
export const collectGeometry = () => {
  const interactive = 'a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=combobox], [role=menuitem], [role=option], [tabindex]:not([tabindex="-1"])'
  const visible = (element) => {
    const style = getComputedStyle(element)
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0
  }
  // Visually hidden text (sr-only) is a 1px clipped box whose text still reports a
  // rect; it is not on screen, so it is not content.
  const clipped = (element) => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const box = node.getBoundingClientRect()
      if ((box.width < 2 || box.height < 2) && getComputedStyle(node).overflow !== "visible") return true
    }
    return false
  }
  // A fixed bar (header, tab bar, scrim) hides what scrolls under it. What the user
  // cannot see or tap is not held to the curves; the point test finds it.
  const covered = (element, rect) => {
    const x = Math.min(Math.max((rect.left + rect.right) / 2, 0), innerWidth - 1)
    const y = Math.min(Math.max((rect.top + rect.bottom) / 2, 0), innerHeight - 1)
    const hit = document.elementFromPoint(x, y)
    return Boolean(hit) && !element.contains(hit) && !hit.contains(element)
  }
  const nameOf = (element) =>
    element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " ").slice(0, 32) || element.getAttribute("placeholder") || element.id || element.tagName.toLowerCase()
  // Content that scrolls passes under the edges, so only fixed or sticky chrome is
  // held to the edge zones at every scroll position (see measure() in run.mjs).
  const pinned = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const position = getComputedStyle(node).position
      if (position === "fixed" || position === "sticky") return true
    }
    return false
  }
  const items = []
  for (const element of document.querySelectorAll(interactive)) {
    if (!visible(element)) continue
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2 || covered(element, rect)) continue
    const slot = element.dataset.slot ? `{${element.dataset.slot}}` : ""
    items.push({ kind: "control", pinned: pinned(element), label: `${element.tagName.toLowerCase()}${slot} "${nameOf(element)}"`, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } })
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.trim()
    const parent = node.parentElement
    if (!text || !parent || !visible(parent) || parent.closest("script, style, noscript") || clipped(parent)) continue
    range.selectNodeContents(node)
    for (const rect of range.getClientRects()) {
      if (rect.width < 2 || rect.height < 2 || covered(parent, rect)) continue
      items.push({ kind: "text", pinned: pinned(parent), label: `"${text.replace(/\s+/g, " ").slice(0, 32)}"`, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } })
    }
  }
  return items
}

// Waits for the page to stop moving: finite animations done, then every element's
// rect unchanged across three samples. Overlays and toasts enter with transitions
// that can start a frame late, so animation state alone is not enough.
export const settle = async () => {
  await document.fonts.ready
  const finite = () => document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
  const snapshot = () =>
    [...document.body.querySelectorAll("*")]
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`
      })
      .join("|")
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  let previous = ""
  let stable = 0
  for (let pass = 0; pass < 40 && stable < 3; pass++) {
    await Promise.allSettled(finite().map((animation) => animation.finished))
    await pause(100)
    const current = snapshot()
    stable = current === previous ? stable + 1 : 0
    previous = current
  }
}

// Draws what the iPhone draws that Chromium does not: the display curves, the
// island and the home-indicator band, plus an outline on each offender.
export const drawOverlay = ({ scenario, radius, islands, bandTop, offenders }) => {
  const { width, height } = scenario.viewport
  const svgNs = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(svgNs, "svg")
  svg.setAttribute("width", String(width))
  svg.setAttribute("height", String(height))
  svg.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none"
  const add = (tag, attrs) => {
    const node = document.createElementNS(svgNs, tag)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
    svg.appendChild(node)
  }
  if (scenario.display.top || scenario.display.bottom) {
    const hiddenTop = scenario.display.top ? 0 : radius
    const hiddenBottom = scenario.display.bottom ? 0 : radius
    const y = -hiddenTop
    const h = height + hiddenTop + hiddenBottom
    add("path", {
      "fill-rule": "evenodd",
      fill: "rgba(220,0,0,0.55)",
      d: `M0 ${y}H${width}V${y + h}H0Z M${radius} ${y}H${width - radius}A${radius} ${radius} 0 0 1 ${width} ${y + radius}V${y + h - radius}A${radius} ${radius} 0 0 1 ${width - radius} ${y + h}H${radius}A${radius} ${radius} 0 0 1 0 ${y + h - radius}V${y + radius}A${radius} ${radius} 0 0 1 ${radius} ${y}Z`,
    })
  }
  for (const island of islands) add("rect", { x: island.left, y: island.top, width: island.right - island.left, height: island.bottom - island.top, rx: 18, fill: "rgba(0,0,0,0.85)" })
  if (Number.isFinite(bandTop)) add("rect", { x: 0, y: bandTop, width, height: height - bandTop, fill: "rgba(255,150,0,0.35)" })
  for (const rect of offenders) add("rect", { x: rect.left, y: rect.top, width: rect.width, height: rect.height, fill: "none", stroke: "#f0f", "stroke-width": 2 })
  document.body.appendChild(svg)
}
