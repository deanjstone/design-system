// The pure half of the curve-geometry gate (design-system#143): the scenario
// matrix, the shapes content must stay out of, and the check of a measured rect
// against them. No browser in here, so test/geometry-gate-geometry.test.ts runs
// it in CI. run.mjs does the measuring.

// Corner radius of every iPhone 16 Pro / 17 / Air display. Older phones are
// 55 and 47.33, which are less strict, so a pass at 62 is a pass at those.
export const DISPLAY_RADIUS = 62

export const ISLAND = { width: 125, height: 37, offset: 14 }

// --edge-b is the bottom inset less 12px (theme/tokens.css): the home indicator
// sits about 12px below where content looks right. The band therefore starts
// 12px below the inset line, matching the design rather than a stricter 34pt.
export const HOME_INDICATOR_TOLERANCE = 12

// display.top / display.bottom say which pairs of display corners are in view.
// A Safari tab and a default-status-bar PWA keep content below the status bar,
// so the top curves are hidden there. `island` is true where the island is in
// the viewport.
const scenario = (name, label, width, height, [top, bottom, left, right], display, island) => ({
  name,
  label,
  viewport: { width, height },
  insets: { top, bottom, left, right },
  display,
  island,
})

const NONE = { top: false, bottom: false }
const ALL = { top: true, bottom: true }

export const SCENARIOS = [
  scenario("zero-insets", "all insets 0 (Safari tab)", 402, 874, [0, 0, 0, 0], NONE, false),
  scenario("iphone-17-portrait", "iPhone 17 portrait", 402, 874, [62, 34, 0, 0], ALL, true),
  scenario("iphone-17-portrait-status-bar", "iPhone 17 portrait, status bar default", 402, 812, [0, 34, 0, 0], { top: false, bottom: true }, false),
  scenario("iphone-17-landscape-top-0", "iPhone 17 landscape, top 0", 874, 402, [0, 20, 62, 62], ALL, true),
  scenario("iphone-17-landscape-top-20", "iPhone 17 landscape, top 20", 874, 402, [20, 20, 62, 62], ALL, true),
  scenario("iphone-air-portrait", "iPhone Air portrait", 420, 912, [68, 34, 0, 0], ALL, true),
  scenario("iphone-air-landscape", "iPhone Air landscape", 912, 420, [20, 29, 68, 68], ALL, true),
]

const drawsDisplay = (s) => s.display.top || s.display.bottom

// The island boxes, in viewport coordinates. Portrait has one at the top; in
// landscape it sits on either short edge depending on which way the phone turned,
// so both are protected.
export const islandBoxes = (s) => {
  if (!s.island) return []
  const { width, height } = s.viewport
  const { width: islandWidth, height: islandHeight, offset } = ISLAND
  if (width <= height) {
    const left = (width - islandWidth) / 2
    return [{ left, right: left + islandWidth, top: offset, bottom: offset + islandHeight }]
  }
  const top = (height - islandWidth) / 2
  return [
    { left: offset, right: offset + islandHeight, top, bottom: top + islandWidth },
    { left: width - offset - islandHeight, right: width - offset, top, bottom: top + islandWidth },
  ]
}

// Content may not go below this y. Infinity where no home indicator is drawn.
export const protectedBandTop = (s) =>
  s.display.bottom && s.insets.bottom > 0
    ? s.viewport.height - s.insets.bottom + HOME_INDICATOR_TOLERANCE
    : Infinity

const pointInside = (x, y, { width, height, radius }) => {
  if (x < 0 || y < 0 || x > width || y > height) return false
  const cx = x < radius ? radius : x > width - radius ? width - radius : x
  const cy = y < radius ? radius : y > height - radius ? height - radius : y
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + 1e-9
}

// A rounded rect is convex, so a rect is inside it exactly when its four corners are.
export const insideRoundedRect = (rect, display) =>
  [
    [rect.left, rect.top],
    [rect.right, rect.top],
    [rect.left, rect.bottom],
    [rect.right, rect.bottom],
  ].every(([x, y]) => pointInside(x, y, display))

const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

const MIN_SIDE = 2
const toRect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top })

// items: [{ kind, label, rect }] in viewport coordinates. Returns one violation
// per offending item, named by the first rule it breaks. Rects are clipped to
// the viewport vertically (scrolled-away content is not on screen); sideways
// overflow is a violation on its own.
export const findViolations = (items, s) => {
  const { width, height } = s.viewport
  const display = { width, height, radius: DISPLAY_RADIUS }
  const islands = islandBoxes(s)
  const bandTop = protectedBandTop(s)
  const violations = []
  for (const { kind, label, rect } of items) {
    const top = Math.max(rect.top, 0)
    const bottom = Math.min(rect.bottom, height)
    if (bottom - top < MIN_SIDE || rect.right - rect.left < MIN_SIDE) continue
    const clipped = toRect(rect.left, top, rect.right, bottom)
    const report = (rule, detail) => violations.push({ rule, kind, label, rect: clipped, detail })
    if (clipped.left < -0.5 || clipped.right > width + 0.5) report("overflow", `spans ${clipped.left.toFixed(1)}..${clipped.right.toFixed(1)} in a ${width}px viewport`)
    else if (drawsDisplay(s) && !insideDisplayInView(clipped, display, s)) report("corner", "has a corner outside the display's rounded rect")
    else if (islands.some((island) => overlaps(clipped, island))) report("island", "overlaps the Dynamic Island")
    else if (clipped.bottom > bandTop + 1e-9) report("band", `reaches y=${clipped.bottom.toFixed(1)}, into the home-indicator band from y=${bandTop}`)
  }
  return violations
}

// Only the corners that are in view count: with the status bar visible the top
// curves are off-screen, so a rect is tested against the display with the top
// (or bottom) edge pushed out of range.
const insideDisplayInView = (rect, display, s) => {
  const lift = s.display.top ? 0 : display.radius
  const drop = s.display.bottom ? 0 : display.radius
  const shifted = { left: rect.left, right: rect.right, top: rect.top + lift, bottom: rect.bottom + lift }
  return insideRoundedRect(shifted, { width: display.width, height: display.height + lift + drop, radius: display.radius })
}
