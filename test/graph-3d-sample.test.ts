// @vitest-environment node

import { describe, expect, it } from "vitest"

import { mapGraph } from "@/lib/graph-3d-core"
import { sampleGraph } from "../docs/graph-3d/sample"

// The demo's seeded sample (design-system#169): the same graph every run, and the
// size and density of the CONTEXT vault the first consumer maps.

describe("sampleGraph", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    expect(sampleGraph(300, 7)).toEqual(sampleGraph(300, 7))
    expect(sampleGraph(300, 7)).not.toEqual(sampleGraph(300, 8))
  })

  it("builds 1,300 nodes and about 2,000 links, all with valid ends", () => {
    const { nodes, links } = sampleGraph(1300)
    expect(nodes).toHaveLength(1300)
    expect(links.length).toBeGreaterThan(1800)
    expect(links.length).toBeLessThan(2300)
    const mapped = mapGraph(nodes, links)
    expect(mapped.droppedLinks).toBe(0)
    expect(mapped.droppedNodes).toBe(0)
  })

  it("spreads nodes over five groups, each of which maps to a chart token", () => {
    const { nodes, links } = sampleGraph(1300)
    const mapped = mapGraph(nodes, links)
    expect(mapped.groups).toHaveLength(5)
    expect(new Set(mapped.groups.map((entry) => entry.token)).size).toBe(5)
  })
})
