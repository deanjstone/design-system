// In-page probes for the checks beyond curve geometry (design-system#143, scope
// from the #144 audit). Each runs inside the page, so each stays self-contained and
// returns plain findings: { check, label, detail }. Playwright serialises each one
// on its own, so a helper shared between them cannot live at module level.

// WCAG 2.5.8: a target is at least 24x24 CSS px. The hit area counts, so a control
// whose ::after widens the tap region is measured by probing outwards from its rect
// until a point no longer lands on it.
export const targetSize = () => {
  const describe = (element) => {
    const name = element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " ").slice(0, 32) || element.getAttribute("placeholder") || element.id || element.tagName.toLowerCase()
    const slot = element.dataset.slot ? `{${element.dataset.slot}}` : ""
    return `${element.tagName.toLowerCase()}${slot} "${name}"`
  }
  const minimum = 24
  const findings = []
  for (const element of document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=combobox]')) {
    const style = getComputedStyle(element)
    if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") continue
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
      findings.push({ check: "target-size", label: describe(element), detail: `hit area ${width.toFixed(1)}x${height.toFixed(1)}, under ${minimum}x${minimum}` })
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

// 320 CSS px wide at 200% text (WCAG 1.4.4 and 1.4.10): nothing scrolls sideways and
// no control or text line ends past the right edge.
export const reflow = () => {
  const describe = (element) => {
    const name = element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " ").slice(0, 32) || element.getAttribute("placeholder") || element.id || element.tagName.toLowerCase()
    const slot = element.dataset.slot ? `{${element.dataset.slot}}` : ""
    return `${element.tagName.toLowerCase()}${slot} "${name}"`
  }
  const interactive = 'a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=combobox]'
  const findings = []
  const overflow = document.documentElement.scrollWidth - innerWidth
  if (overflow > 1) findings.push({ check: "reflow", label: "document", detail: `scrolls sideways by ${overflow}px` })
  for (const element of document.querySelectorAll(interactive)) {
    const style = getComputedStyle(element)
    if (style.visibility === "hidden" || style.display === "none") continue
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    if (rect.right > innerWidth + 0.5 || rect.left < -0.5) findings.push({ check: "reflow", label: describe(element), detail: `spans ${rect.left.toFixed(1)}..${rect.right.toFixed(1)} in a ${innerWidth}px viewport` })
  }
  return findings
}
