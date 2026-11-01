// @vitest-environment node

import { describe, expect, it } from "vitest"
import { KNOWN, classify } from "../scripts/geometry-gate/checks.mjs"

// The KNOWN list of the geometry gate (design-system#143): a filed finding is
// reported and passes, a new one fails, and an entry that stopped firing is stale.

const finding = (check: string, view: string, label: string, scenario = "iphone-17-landscape-top-0") => ({
  check,
  scenario,
  view,
  label,
  detail: "x",
})

describe("classify", () => {
  it("passes a finding the audit already filed and names its issue", () => {
    const { fresh, known } = classify([finding("reduced-motion", "states", "[spinner] spin", "reduced-motion")])
    expect(fresh).toEqual([])
    expect(known[0]).toMatchObject({ issue: 147 })
  })

  it("fails a finding nobody filed", () => {
    const { fresh } = classify([finding("target-size", "dialog", 'button{button} "OK"')])
    expect(fresh).toHaveLength(1)
  })

  it("does not let a known label excuse the same label in another view", () => {
    const { fresh } = classify([finding("reduced-motion", "dialog", "[spinner] spin", "reduced-motion")])
    expect(fresh).toHaveLength(1)
  })

  it("lists every KNOWN entry as stale when nothing fires", () => {
    expect(classify([]).stale).toHaveLength(KNOWN.length)
  })

  it("limits the stale check to the entries a run covered", () => {
    expect(classify([], (entry: { view?: string }) => entry.view === "states").stale.every((entry: { view?: string }) => entry.view === "states")).toBe(true)
  })

  it("points every entry at an issue", () => {
    expect(KNOWN.every((entry: { issue: number }) => Number.isInteger(entry.issue))).toBe(true)
  })
})
