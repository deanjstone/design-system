// In-page probes for the checks beyond curve geometry (design-system#143, scope
// from the #144 audit). Each runs inside the page, so each stays self-contained and
// returns plain findings: { check, label, detail }. Playwright serialises each one
// on its own, so a helper shared between them cannot live at module level.

// WCAG 2.5.8: a target is at least 24x24 CSS px. The hit area counts, so a control
// whose ::after widens the tap region is measured by probing outwards from its rect
// until a point no longer lands on it. The touch-target check (design-system#145)
// reuses it with 44 and the form-control selector, because Playwright serialises each
// probe on its own and so cannot share a helper.
export const targetSize = ({ minimum = 24, selector = 'a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=combobox]', check = "target-size" } = {}) => {
  const describe = (element) => {
    const name = element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " ").slice(0, 32) || element.getAttribute("placeholder") || element.id || element.tagName.toLowerCase()
    const slot = element.dataset.slot ? `{${element.dataset.slot}}` : ""
    return `${element.tagName.toLowerCase()}${slot} "${name}"`
  }
  const findings = []
  for (const element of document.querySelectorAll(selector)) {
    const style = getComputedStyle(element)
    if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") continue
    // elementFromPoint answers null below the fold, which would read as a hit area
    // of zero, so each control is scrolled into view before it is probed.
    element.scrollIntoView({ block: "center", inline: "center" })
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 && rect.height < 2) continue
    const centreX = rect.x + rect.width / 2
    const centreY = rect.y + rect.height / 2
    const reach = (dx, dy) => {
      let steps = 0
      for (let step = 1; step <= 24; step++) {
        const hit = document.elementFromPoint(centreX + dx * (rect.width / 2 + step - 0.5), centreY + dy * (rect.height / 2 + step - 0.5))
        if (hit && (hit === element || element.contains(hit))) steps = step
        else break
      }
      return steps
    }
    const width = rect.width + reach(-1, 0) + reach(1, 0)
    const height = rect.height + reach(0, -1) + reach(0, 1)
    if (width < minimum || height < minimum) {
      findings.push({ check, label: describe(element), detail: `hit area ${width.toFixed(1)}x${height.toFixed(1)}, under ${minimum}x${minimum}` })
    }
  }
  return findings
}

// iOS Safari zooms the page when a field under 16px takes focus.
export const inputFontSize = () => {
  const describe = (element) => {
    const name = element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " ").slice(0, 32) || element.getAttribute("placeholder") || element.id || element.tagName.toLowerCase()
    const slot = element.dataset.slot ? `{${element.dataset.slot}}` : ""
    return `${element.tagName.toLowerCase()}${slot} "${name}"`
  }
  const findings = []
  for (const element of document.querySelectorAll("input, textarea, select")) {
    if (["checkbox", "radio", "hidden", "range", "button", "submit"].includes(element.type)) continue
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    const size = parseFloat(getComputedStyle(element).fontSize)
    if (size < 16) findings.push({ check: "input-font-size", label: describe(element), detail: `font-size ${size}px, under 16px` })
  }
  return findings
}

// With prefers-reduced-motion: reduce, nothing may keep moving. Colour and shadow
// transitions are not motion; slides, spins, pulses and fades are. Entrance
// animations are short, so the page is sampled for 800ms rather than once.
export const motion = async () => {
  const movement = /^(transform|translate|scale|rotate|opacity|top|left|right|bottom|inset|margin|width|height)/
  const found = new Map()
  for (let sample = 0; sample < 16; sample++) {
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getComputedTiming()
      if (!timing || (timing.iterations !== Infinity && Number(timing.duration) <= 1)) continue
      if (animation.transitionProperty && !movement.test(animation.transitionProperty)) continue
      const target = animation.effect.target
      const label = target?.dataset?.slot ? `[${target.dataset.slot}]` : (target?.tagName?.toLowerCase() ?? "unknown")
      const name = animation.animationName ?? animation.transitionProperty ?? animation.constructor.name
      found.set(`${label} ${name}`, { check: "reduced-motion", label: `${label} ${name}`, detail: `still animating under reduce (${timing.iterations === Infinity ? "infinite" : `${timing.duration}ms`})` })
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return [...found.values()]
}

// WCAG 2.4.11 Focus Not Obscured: Tab through the page; the focused control's centre
// must not sit under something that is not it. Returns each stop for the caller to
// drive, so this half only judges the current focus.
export const focusObscured = () => {
  const describe = (element) => {
    const name = element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " ").slice(0, 32) || element.getAttribute("placeholder") || element.id || element.tagName.toLowerCase()
    const slot = element.dataset.slot ? `{${element.dataset.slot}}` : ""
    return `${element.tagName.toLowerCase()}${slot} "${name}"`
  }
  const element = document.activeElement
  if (!element || element === document.body) return null
  const rect = element.getBoundingClientRect()
  // Overlay focus guards are 1px tabbable spans, not controls.
  if (rect.width < 2 || rect.height < 2) return { label: describe(element), obscured: false, detail: "" }
  const x = Math.min(Math.max(rect.x + rect.width / 2, 0), innerWidth - 1)
  const y = Math.min(Math.max(rect.y + rect.height / 2, 0), innerHeight - 1)
  const hit = document.elementFromPoint(x, y)
  const onScreen = rect.bottom > 0 && rect.top < innerHeight
  const obscured = !onScreen || (hit && !element.contains(hit) && !hit.contains(element))
  return { label: describe(element), obscured, detail: onScreen ? `covered by ${hit ? describe(hit) : "nothing"}` : "scrolled off screen" }
}

// The login card is a background, so the curve check exempts it, but a card pushed
// against a screen edge reads as clipped by the curve and cannot be scrolled clear of
// the island or the home indicator (design-system#149, #144 S5). The card keeps
// max(1rem, inset) from each side, and from the top and the bottom at the matching end
// of the scroll. Run with the scenario's CDP insets; a page that does not scroll is held
// to both ends at once.
export const LOGIN_GUTTER = 16

export const loginEdges = ({ insets, gutter }) => {
  const card = document.querySelector('[data-slot="login"] [data-slot="card"]')
  if (!card) return [{ check: "login-edges", label: "card", detail: "no card inside [data-slot=login]" }]
  const findings = []
  const need = (inset) => Math.max(gutter, inset)
  const scrollMax = Math.max(0, document.documentElement.scrollHeight - innerHeight)
  const measureAt = (y) => {
    scrollTo(0, y)
    return card.getBoundingClientRect()
  }
  const top = measureAt(0)
  const bottom = measureAt(scrollMax)
  scrollTo(0, 0)
  const verdict = (edge, gap, inset) => {
    if (gap < need(inset) - 0.5) findings.push({ check: "login-edges", label: `card ${edge}`, detail: `${gap.toFixed(1)}px from the ${edge} edge, needs ${need(inset)}px (max(${gutter}px, inset ${inset}px))` })
  }
  verdict("top", top.top, insets.top)
  verdict("left", top.left, insets.left)
  verdict("right", innerWidth - top.right, insets.right)
  verdict("bottom", innerHeight - bottom.bottom, insets.bottom)
  return findings
}

// 320 CSS px wide at 200% text (WCAG 1.4.4 and 1.4.10): nothing scrolls sideways and
// no control or text line ends past the right edge. `width` is the width the context
// was asked for: a mobile-emulated page widens its layout viewport to fit overflowing
// content, so innerWidth would always agree with the overflow it should be measured against.
export const reflow = ({ width = innerWidth } = {}) => {
  const describe = (element) => {
    const name = element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " ").slice(0, 32) || element.getAttribute("placeholder") || element.id || element.tagName.toLowerCase()
    const slot = element.dataset.slot ? `{${element.dataset.slot}}` : ""
    return `${element.tagName.toLowerCase()}${slot} "${name}"`
  }
  const interactive = 'a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=combobox]'
  const findings = []
  const overflow = document.documentElement.scrollWidth - width
  if (overflow > 1) findings.push({ check: "reflow", label: "document", detail: `scrolls sideways by ${overflow}px` })
  for (const element of document.querySelectorAll(interactive)) {
    const style = getComputedStyle(element)
    if (style.visibility === "hidden" || style.display === "none") continue
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    if (rect.right > width + 0.5 || rect.left < -0.5) findings.push({ check: "reflow", label: describe(element), detail: `spans ${rect.left.toFixed(1)}..${rect.right.toFixed(1)} in a ${width}px viewport` })
  }
  return findings
}

// What the AppShell's chrome may take of a tall-enough screen at large text (design-system#150,
// #162): the header and the tab bar together, as a share of the viewport height. The #144
// probe measured 34% at 200%; the cap and icon-only tabs bring it under this.
export const CHROME_CEILING = 0.25

// Large text, on the chrome and the controls (WCAG 1.4.4, 1.4.10): a tab label that is
// truncated is clipped, a control whose text is cut by overflow is clipped, the header and
// tab bar stay under CHROME_CEILING of the viewport, and the shell publishes the heights it
// really has. `height` is the viewport height the context was asked for.
export const largeText = ({ height = innerHeight, ceiling }) => {
  const describe = (element) => {
    const name = element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " ").slice(0, 32) || element.getAttribute("placeholder") || element.id || element.tagName.toLowerCase()
    const slot = element.dataset.slot ? `{${element.dataset.slot}}` : ""
    return `${element.tagName.toLowerCase()}${slot} "${name}"`
  }
  const interactive = 'a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=combobox]'
  const shown = (element) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.visibility !== "hidden" && style.display !== "none" && rect.width >= 2 && rect.height >= 2
  }
  const findings = []

  const header = document.querySelector('[data-slot="app-shell-header"]')
  const bar = document.querySelector('[data-slot="app-shell-tabbar"]')
  if (header && bar && shown(header) && shown(bar)) {
    const used = header.getBoundingClientRect().height + bar.getBoundingClientRect().height
    if (used / height > ceiling) {
      findings.push({ check: "chrome-share", label: "app-shell header + tab bar", detail: `${used.toFixed(0)}px is ${(used / height * 100).toFixed(1)}% of a ${height}px viewport, over ${(ceiling * 100).toFixed(0)}%` })
    }
  }

  const root = document.querySelector('[data-slot="app-shell"]')
  const top = document.querySelector('[data-slot="app-shell-top"]')
  if (root && top && bar && shown(bar)) {
    const published = (name) => Number.parseFloat(getComputedStyle(root).getPropertyValue(name))
    const bottom = bar.getBoundingClientRect()
    const wanted = [
      ["--shell-top", top.getBoundingClientRect().bottom],
      ["--shell-bottom", height - bottom.top],
    ]
    for (const [name, pixels] of wanted) {
      if (!(Math.abs(published(name) - pixels) <= 1.5)) findings.push({ check: "shell-metrics", label: name, detail: `published ${getComputedStyle(root).getPropertyValue(name) || "nothing"}, the chrome measures ${pixels.toFixed(1)}px` })
    }
    // --shell-workspace is a calc() of the other two and a viewport unit, so it is read as the
    // height of an element that takes it.
    const probe = document.createElement("div")
    probe.style.cssText = "position:absolute;visibility:hidden;width:1px;height:var(--shell-workspace)"
    root.append(probe)
    const workspace = probe.getBoundingClientRect().height
    probe.remove()
    const expected = height - published("--shell-top") - published("--shell-bottom")
    if (!(Math.abs(workspace - expected) <= 1.5)) findings.push({ check: "shell-metrics", label: "--shell-workspace", detail: `published ${workspace}px, the viewport less both is ${expected.toFixed(1)}px` })
  }

  for (const label of document.querySelectorAll('[data-slot="app-shell-tabbar"] a > span, [data-slot="app-shell-more"] > span')) {
    if (!shown(label)) continue
    // A label is cut when it is truncated, or when it sticks out of its own tab: a flex item stays at
    // its longest word's width, so a tab too narrow for it overflows into the next one without any ellipsis.
    const labelBox = label.getBoundingClientRect()
    const tab = label.parentElement.getBoundingClientRect()
    const truncated = label.scrollWidth > label.clientWidth + 1
    if (truncated || labelBox.left < tab.left - 1 || labelBox.right > tab.right + 1) {
      findings.push({ check: "clipped-label", label: describe(label.parentElement), detail: `label "${label.textContent.trim()}" is ${labelBox.width.toFixed(1)}px wide in a ${tab.width.toFixed(1)}px tab` })
    }
  }

  const headerless = (element) => !element.closest('[data-slot="app-shell-header"]')
  for (const element of document.querySelectorAll(interactive)) {
    if (!shown(element) || !headerless(element)) continue
    const style = getComputedStyle(element)
    const cuts = style.overflowX === "hidden" || style.overflowX === "clip"
    if (cuts && style.textOverflow !== "ellipsis" && element.scrollWidth > element.clientWidth + 1) {
      findings.push({ check: "clipped-control", label: describe(element), detail: `content needs ${element.scrollWidth}px, has ${element.clientWidth}px` })
      continue
    }
    const rect = element.getBoundingClientRect()
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const clip = getComputedStyle(ancestor)
      if (clip.overflowX !== "hidden" && clip.overflowX !== "clip") continue
      const box = ancestor.getBoundingClientRect()
      if (rect.right > box.right + 1 || rect.left < box.left - 1) {
        findings.push({ check: "clipped-control", label: describe(element), detail: `reaches ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}, cut by ${describe(ancestor)} at ${box.left.toFixed(1)}..${box.right.toFixed(1)}` })
        break
      }
    }
  }
  return findings
}

// The form controls the #145 audit held to 44pt on a coarse pointer (iOS HIG). Each
// is matched by its data-slot; a link or button badge is a control, a plain one is
// not. Exempt, and so absent from this list: inline links inside running text
// (WCAG 2.5.8 inline exception), the radio and checkbox rows inside `questionnaire`
// (already 44 by their own rule), and menu / select items, which are 36px rows
// inside a popup that scrolls and are tapped with the popup open.
export const TOUCH_TARGET = {
  minimum: 44,
  check: "touch-target",
  selector: [
    '[data-slot="input"]',
    '[data-slot="textarea"]',
    '[data-slot="command-input"]',
    '[data-slot="toggle"]',
    '[data-slot="select-trigger"]',
    '[data-slot="tabs-trigger"]',
    'a[data-slot="badge"]',
    'button[data-slot="badge"]',
    '[data-slot="checkbox"]',
    '[data-slot="switch"]',
    '[data-slot="button"]',
  ].join(", "),
}

// The labels drawn on the glass bars (design-system#146, #144 C6): the text lines and
// icons inside the AppShell header and tab bar, each with its resolved colour as sRGB
// bytes and its rect in CSS px. The colour goes through a canvas because a Tailwind
// opacity utility computes to color-mix()/color(), which has no one fixed string form.
export const GLASS_BARS = '[data-slot="app-shell-header"], [data-slot="app-shell-tabbar"]'

export const glassLabels = (barSelector) => {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })
  const resolve = (value) => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = "#000"
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    return { r, g, b, a: a / 255 }
  }
  const labels = []
  for (const bar of document.querySelectorAll(barSelector)) {
    const barName = bar.dataset.slot
    const walker = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.trim()
      const parent = node.parentElement
      if (!text || getComputedStyle(parent).visibility === "hidden") continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) {
        if (rect.width < 2 || rect.height < 2) continue
        labels.push({ bar: barName, kind: "text", text, color: resolve(getComputedStyle(parent).color), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })
      }
    }
    for (const icon of bar.querySelectorAll("svg")) {
      const rect = icon.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2 || getComputedStyle(icon).visibility === "hidden") continue
      labels.push({ bar: barName, kind: "icon", text: icon.closest("[aria-label]")?.getAttribute("aria-label") ?? icon.parentElement.textContent.trim() ?? "icon", color: resolve(getComputedStyle(icon).color), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })
    }
  }
  return labels
}

// Decodes a screenshot and samples a grid of pixels inside each rect: the glass as
// painted, backdrop blur and all, with the labels already hidden by the caller.
export const sampleBackdrop = async ({ png, scale, rects }) => {
  const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  context.drawImage(bitmap, 0, 0)
  return rects.map((rect) => {
    const samples = []
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 9; column++) {
        const x = Math.min(bitmap.width - 1, Math.max(0, Math.round((rect.x + (rect.width * (column + 0.5)) / 9) * scale)))
        const y = Math.min(bitmap.height - 1, Math.max(0, Math.round((rect.y + (rect.height * (row + 0.5)) / 5) * scale)))
        const [r, g, b] = context.getImageData(x, y, 1, 1).data
        samples.push([r, g, b])
      }
    }
    return samples
  })
}
