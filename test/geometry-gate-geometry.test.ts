// @vitest-environment node

import { describe, expect, it } from "vitest"
import {
  HOME_INDICATOR_TOLERANCE,
  SCENARIOS,
  findViolations,
  insideRoundedRect,
  islandBoxes,
  protectedBandTop,
} from "../scripts/geometry-gate/geometry.mjs"

// The pure half of the curve-geometry gate (design-system#143): where the display
// curves, the Dynamic Island and the home-indicator band are, and which measured
// rects break them. The browser half lives in scripts/geometry-gate/run.mjs.

const scenario = (name: string) => SCENARIOS.find((candidate: { name: string }) => candidate.name === name)!
const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
})
const item = (box: ReturnType<typeof rect>, kind = "text", label = "x") => ({ kind, label, rect: box })

describe("scenario matrix", () => {
  it("covers the inset matrix from the ticket, in device points", () => {
    const summary = SCENARIOS.map(
      (s: { viewport: { width: number; height: number }; insets: Record<string, number> }) =>
        `${s.viewport.width}x${s.viewport.height} ${s.insets.top}/${s.insets.bottom}/${s.insets.left}/${s.insets.right}`,
    )
    expect(summary).toEqual(
      expect.arrayContaining([
        "402x874 0/0/0/0",
        "402x874 62/34/0/0",
        "874x402 0/20/62/62",
        "874x402 20/20/62/62",
        "420x912 68/34/0/0",
        "912x420 20/29/68/68",
      ]),
    )
  })

  it("gives every scenario a unique name", () => {
    const names = SCENARIOS.map((s: { name: string }) => s.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe("insideRoundedRect", () => {
  const display = { width: 402, height: 874, radius: 62 }

  it("accepts a rect well inside the display", () => {
    expect(insideRoundedRect(rect(20, 100, 380, 800), display)).toBe(true)
  })

  it("rejects a rect whose corner sits in the curved-away corner of the display", () => {
    expect(insideRoundedRect(rect(8, 8, 200, 40), display)).toBe(false)
  })

  it("accepts a corner exactly on the arc and rejects one a pixel outside it", () => {
    const onArc = 62 - 62 * Math.SQRT1_2
    expect(insideRoundedRect(rect(onArc + 0.01, onArc + 0.01, 200, 200), display)).toBe(true)
    expect(insideRoundedRect(rect(onArc - 1, onArc - 1, 200, 200), display)).toBe(false)
  })

  it("treats each of the four corners alike", () => {
    expect(insideRoundedRect(rect(150, 840, 394, 870), display)).toBe(false)
    expect(insideRoundedRect(rect(8, 840, 200, 870), display)).toBe(false)
    expect(insideRoundedRect(rect(200, 4, 394, 30), display)).toBe(false)
  })

  it("rejects a rect that leaves the display", () => {
    expect(insideRoundedRect(rect(100, 100, 500, 200), display)).toBe(false)
  })
})

describe("protected zones", () => {
  it("puts the island 125x37 at 14pt from the top, centred, in portrait", () => {
    const [island] = islandBoxes(scenario("iphone-17-portrait"))
    expect(island.top).toBe(14)
    expect(island.bottom).toBe(51)
    expect(island.right - island.left).toBe(125)
    expect((island.left + island.right) / 2).toBe(201)
  })

  it("puts the island on either short edge in landscape", () => {
    const boxes = islandBoxes(scenario("iphone-17-landscape-top-0"))
    expect(boxes).toHaveLength(2)
    const [left, right] = boxes
    expect(left.left).toBe(14)
    expect(left.right).toBe(51)
    expect(left.bottom - left.top).toBe(125)
    expect(right.right).toBe(874 - 14)
  })

  it("has no island where the status bar keeps content below it, or the display is not drawn", () => {
    expect(islandBoxes(scenario("zero-insets"))).toEqual([])
    expect(islandBoxes(scenario("iphone-17-portrait-status-bar"))).toEqual([])
  })

  it("starts the home-indicator band at the bottom inset less the design's own tolerance", () => {
    expect(HOME_INDICATOR_TOLERANCE).toBe(12)
    expect(protectedBandTop(scenario("iphone-17-portrait"))).toBe(874 - 34 + 12)
    expect(protectedBandTop(scenario("zero-insets"))).toBe(Infinity)
  })
})

describe("findViolations", () => {
  const portrait = scenario("iphone-17-portrait")

  it("is empty for content inside the curve, clear of the island and above the band", () => {
    expect(findViolations([item(rect(20, 100, 380, 140))], portrait)).toEqual([])
  })

  it("names a corner violation", () => {
    const [violation] = findViolations([item(rect(4, 4, 120, 30), "control", "Back")], portrait)
    expect(violation).toMatchObject({ rule: "corner", label: "Back", kind: "control" })
  })

  it("names an island violation for content under the island that is clear of the corners", () => {
    const [violation] = findViolations([item(rect(150, 20, 250, 44), "text", "Title")], portrait)
    expect(violation).toMatchObject({ rule: "island", label: "Title" })
  })

  it("names a band violation for content inside the home-indicator band", () => {
    const [violation] = findViolations([item(rect(100, 845, 300, 870), "control", "Tab")], portrait)
    expect(violation.rule).toBe("band")
  })

  it("lets content sit in the 12px the design allows below the safe edge", () => {
    expect(findViolations([item(rect(100, 800, 300, 852))], portrait)).toEqual([])
  })

  it("ignores rects with no visible area, and clips partly off-screen rects to the viewport", () => {
    expect(findViolations([item(rect(0, 0, 1, 1))], portrait)).toEqual([])
    expect(findViolations([item(rect(20, 2000, 380, 2040))], portrait)).toEqual([])
    expect(findViolations([item(rect(20, 100, 380, 3000))], portrait)).toHaveLength(1)
  })

  it("skips the curve, island and band rules where the display is not drawn", () => {
    expect(findViolations([item(rect(0, 0, 402, 30))], scenario("zero-insets"))).toEqual([])
  })

  it("still flags horizontal overflow where the display is not drawn", () => {
    const [violation] = findViolations([item(rect(300, 100, 500, 140))], scenario("zero-insets"))
    expect(violation.rule).toBe("overflow")
  })

  it("catches a landscape header that ignores the side insets", () => {
    const landscape = scenario("iphone-17-landscape-top-0")
    const header = item(rect(8, 4, 120, 44), "control", "Back")
    expect(findViolations([header], landscape)[0].rule).toBe("corner")
    expect(findViolations([item(rect(70, 4, 180, 44), "control", "Back")], landscape)).toEqual([])
  })
})
